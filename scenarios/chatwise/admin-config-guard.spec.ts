// LIVE SECURITY REGRESSION: tenant-wide config routes are reachable from the
// CHAT iframe — so their guards have to hold there, not just on the admin page.
//
// THE THREAT MODEL (src/shared/access/guardResolver.js:41-68). Most config
// routes are registered on the CHAT resolver as well as the admin one, because
// the chat surfaces read settings / personas / the model on every turn. But
// `invoke()` is not limited to the buttons the UI happens to render: anyone who
// can open the chat iframe can call ANY route on that resolver from the
// console. Before ADMIN_MUTATION_ROUTES existed, any licensed user could switch
// the site's model, flip the whole app into scripted test mode, rewrite the
// system prompt, retarget the uploads project or delete every persona — for
// everyone.
//
// This spec calls those routes THE SAME WAY an attacker would: through the
// bridge, from inside the chat iframe, with a real Forge identity. It asserts
// both directions of the contract:
//
//   ALLOWED — the harness account IS a wolfaenpak Jira site admin, so the
//   admin-gated writes must SUCCEED. (A guard that refuses the admin is just as
//   broken as one that lets everyone through, and is the failure mode that
//   bricks the app for its own operator.)
//
//   REFUSED — a payload the app must reject regardless of who is asking. A SAFe
//   Epic field mapped onto a Jira SYSTEM field id would make the Epic wizard
//   overwrite `summary`/`description` with SAFe prose on every Epic it creates
//   (epicFields.routes.js:36-46), so `saveEpicFieldMapping` must refuse it —
//   and, critically, must not half-save the rest of the payload.
//
// HONEST LIMIT: the harness has ONE browser identity, and it is an admin. The
// negative half of the ADMIN gate ("a non-admin is refused") is therefore NOT
// exercised here — that needs a second, non-admin account. What this spec
// proves about that gate is (a) the caller really is an admin
// (`getAccessStatus.admin`), so the successes below are attributable, and (b)
// the payload validation refuses bad input on a route that carries the same
// admin gate. Anything stronger would be a claim the evidence doesn't support.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  BASE_URL, GLOBAL_APP, assertLoggedIn, callResolver, openGlobalPage,
  setRecorderTarget, waitForChatApp,
} from "./chatwise-support";

const T = getTarget("chatwise-global");

/** Jira Cloud names every custom field `customfield_<n>` — nothing else may be mapped. */
const SYSTEM_FIELD_REJECTIONS = [
  { label: "system field: summary", mapping: { epicHypothesis: { id: "summary" } } },
  { label: "system field: description", mapping: { epicBenefit: { id: "description" } } },
  { label: "system field: issuetype", mapping: { nfrs: { id: "issuetype" } } },
  { label: "malformed custom-field id", mapping: { acceptanceCriteria: { id: "customfield_ABC" } } },
  {
    // The interesting one: a VALID entry alongside an invalid one. The write
    // must be refused ATOMICALLY — a partial save would leave the tenant with a
    // mapping nobody chose.
    label: "mixed payload (one valid + one system field)",
    mapping: { epicHypothesis: { id: "customfield_10001" }, epicBenefit: { id: "summary" } },
  },
  { label: "non-object payload", mapping: "not-a-mapping" },
];

test.describe.configure({ retries: 1, timeout: 240_000 });

test("ChatWise config guards hold when called from the CHAT iframe", async ({ page, recorder }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover` or set it in .env.");
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);

  let restoreTestMode: boolean | null = null;
  let restoreModel: string | null = null;
  let modelWasUnset = false;

  try {
    await assertLoggedIn(page);
    const frame = await openGlobalPage(page, T, recorder);
    await waitForChatApp(page, frame, GLOBAL_APP);

    await recorder.step("the caller is a Jira SITE ADMIN (so the successes below are attributable)", async () => {
      const access = await callResolver<{ success?: boolean; allowed?: boolean; admin?: boolean }>(
        frame, GLOBAL_APP, "getAccessStatus",
      );
      expect(access?.allowed, "the harness account must be past the beta gate").toBe(true);

      // Deliberately NOT `access.admin`. checkBetaAccess() short-circuits on the
      // allow-list BEFORE it probes Jira permissions, so for an allow-listed
      // caller `admin` is always false — it is a by-product of the
      // NOT-allow-listed path, not an answer about this caller. (That is why
      // requireAdmin.js re-probes instead of trusting the flag;
      // src/shared/access/requireAdmin.js:1-30.) Verified live: this account is
      // allow-listed and getAccessStatus returns admin:false while genuinely
      // holding ADMINISTER.
      //
      // The oracle is Jira itself, asked from the HOST page so it uses the same
      // browser session the iframe's invoke() runs under — an independent
      // source of truth, not the app's own answer about itself.
      const who = await page.evaluate(async () => {
        const j = async (u: string) =>
          (await fetch(u, { headers: { Accept: "application/json" }, credentials: "include" })).json();
        const me = await j("/rest/api/3/myself");
        const perms = await j("/rest/api/3/mypermissions?permissions=ADMINISTER");
        return {
          accountId: me?.accountId,
          email: me?.emailAddress,
          admin: !!perms?.permissions?.ADMINISTER?.havePermission,
        };
      });
      test.info().annotations.push({
        type: "identity",
        description: `${who.email ?? who.accountId} — ADMINISTER=${who.admin}, getAccessStatus.admin=${access?.admin}`,
      });
      expect(who.admin, "the browser session must hold Jira ADMINISTER for this spec to mean anything").toBe(true);
    }, {
      expectation: {
        assertion: "the browser session is past the beta gate AND holds Jira ADMINISTER (per Jira's own /mypermissions)",
        narrative: "Establishes the identity the rest of the spec reasons about — without it, a passing write proves nothing.",
      },
    });

    // ---------- capture the baseline so every write is reversible ----------
    await recorder.step("capture the current tenant configuration", async () => {
      const tm = await callResolver<{ enabled?: boolean }>(frame, GLOBAL_APP, "getTestMode");
      restoreTestMode = tm?.enabled === true;
      const sm = await callResolver<{ model?: string | null }>(frame, GLOBAL_APP, "getSelectedModel");
      restoreModel = sm?.model || null;
      modelWasUnset = !restoreModel;
      test.info().annotations.push({
        type: "baseline",
        description: `testMode=${restoreTestMode} model=${restoreModel ?? "(unset)"}`,
      });
    }, {
      expectation: {
        assertion: "getTestMode + getSelectedModel answer, giving a restore point",
        narrative: "Every mutation below is written back to this baseline in the finally block.",
      },
    });

    // ---------- ALLOWED: the admin-gated writes must SUCCEED ----------
    await recorder.step('ALLOWED — invoke("setTestMode", {enabled:true}) from the chat iframe', async () => {
      const r = await callResolver<{ success?: boolean; enabled?: boolean; error?: string }>(
        frame, GLOBAL_APP, "setTestMode", { enabled: true },
      );
      expect(r?.success, `setTestMode was refused for a site admin: ${JSON.stringify(r)}`).toBe(true);
      expect(r?.enabled).toBe(true);
      const readback = await callResolver<{ enabled?: boolean }>(frame, GLOBAL_APP, "getTestMode");
      expect(readback?.enabled, "the write must be observable, not just acknowledged").toBe(true);
    }, {
      expectation: {
        assertion: "an admin's setTestMode succeeds and is readable back",
        narrative: "The admin gate lets the site's own administrator configure the app — it does not lock the operator out.",
      },
    });

    await recorder.step('ALLOWED — invoke("saveSelectedModel") from the chat iframe', async () => {
      const models = await callResolver<{ success?: boolean; models?: { id: string }[] }>(
        frame, GLOBAL_APP, "getModels",
      );
      const ids = (models?.models || []).map((m) => m.id);
      expect(ids.length, "the provider must offer at least one Claude tier").toBeGreaterThan(0);
      // Round-trip the CURRENT value where possible, so this write is a no-op.
      const target = restoreModel && ids.includes(restoreModel) ? restoreModel : ids[0];
      const r = await callResolver<{ success?: boolean; message?: string }>(
        frame, GLOBAL_APP, "saveSelectedModel", { model: target },
      );
      expect(r?.success, `saveSelectedModel was refused for a site admin: ${JSON.stringify(r)}`).toBe(true);
      const readback = await callResolver<{ model?: string }>(frame, GLOBAL_APP, "getSelectedModel");
      expect(readback?.model, "the selected model must be readable back").toBe(target);
    }, {
      expectation: {
        assertion: "an admin's saveSelectedModel succeeds and is readable back",
        narrative: "The model picker works from a real Forge identity, not only from the admin page's own bridge.",
      },
    });

    // ---------- REFUSED: policy, regardless of caller ----------
    await recorder.step("REFUSED — a model outside the Forge LLM policy cannot be saved", async () => {
      const r = await callResolver<{ success?: boolean; message?: string }>(
        frame, GLOBAL_APP, "saveSelectedModel", { model: "gpt-4o" },
      );
      expect(r?.success, `an out-of-policy model was ACCEPTED: ${JSON.stringify(r)}`).toBe(false);
      expect(String(r?.message || ""), "the refusal should say why").toMatch(/not an available Claude tier/i);
      const readback = await callResolver<{ model?: string }>(frame, GLOBAL_APP, "getSelectedModel");
      expect(readback?.model, "a refused model must not have been written").not.toBe("gpt-4o");
    }, {
      expectation: {
        assertion: 'saveSelectedModel({model:"gpt-4o"}) is refused and nothing is written',
        narrative: "The billing backstop holds at the trust boundary: the tenant cannot be pointed at a model the app is not allowed to call.",
      },
    });

    await recorder.step("REFUSED — Epic field mappings onto Jira SYSTEM fields", async () => {
      const before = await callResolver<{ success?: boolean; mapping?: unknown }>(
        frame, GLOBAL_APP, "getEpicFieldMapping",
      );
      expect(before?.success, "getEpicFieldMapping (an OPEN read) must answer").toBe(true);
      const baseline = JSON.stringify(before?.mapping ?? null);

      const accepted: string[] = [];
      for (const probe of SYSTEM_FIELD_REJECTIONS) {
        const r = await callResolver<{ success?: boolean; error?: string }>(
          frame, GLOBAL_APP, "saveEpicFieldMapping", { mapping: probe.mapping },
        );
        if (r?.success !== false) {
          accepted.push(`${probe.label} → ACCEPTED: ${JSON.stringify(r)}`);
          continue;
        }
        // A refusal is only correct if it is the VALIDATION refusal. An
        // "adminOnly" refusal here would mean the spec's own admin assumption
        // broke, and a silent generic error would hide a crash.
        expect(String(r.error || ""), `refusal reason for "${probe.label}"`)
          .toMatch(/only Jira custom fields|Invalid mapping payload/i);
      }
      expect(accepted, `a mapping onto a system field was SAVED:\n${accepted.join("\n")}`).toEqual([]);

      const after = await callResolver<{ mapping?: unknown }>(frame, GLOBAL_APP, "getEpicFieldMapping");
      expect(
        JSON.stringify(after?.mapping ?? null),
        "a refused mapping must leave the stored mapping completely untouched (no partial save)",
      ).toBe(baseline);
    }, {
      expectation: {
        assertion: "every system-field / malformed mapping is refused, and the stored mapping is byte-identical afterwards",
        narrative: "The Epic wizard can never be reconfigured to overwrite a real issue's summary or description with SAFe prose.",
      },
    });
  } finally {
    // Restore the tenant exactly as found. This runs even when an assertion
    // above blew up mid-way, which is the whole point of capturing a baseline.
    const frame = await openGlobalPage(page, T).catch(() => null);
    if (frame) {
      await waitForChatApp(page, frame, GLOBAL_APP, 60_000).catch(() => {});
      if (restoreTestMode !== null) {
        await callResolver(frame, GLOBAL_APP, "setTestMode", { enabled: restoreTestMode }).catch(() => {});
        const check = await callResolver<{ enabled?: boolean }>(frame, GLOBAL_APP, "getTestMode")
          .catch(() => ({}) as { enabled?: boolean });
        test.info().annotations.push({
          type: "cleanup",
          description: `testMode restored to ${restoreTestMode} (readback=${JSON.stringify(check)})`,
        });
        if (check?.enabled !== restoreTestMode) console.error("[chatwise] test mode NOT restored:", check);
      }
      if (restoreModel) {
        await callResolver(frame, GLOBAL_APP, "saveSelectedModel", { model: restoreModel }).catch(() => {});
      } else if (modelWasUnset) {
        // No route un-sets the model, so record that this run left one behind.
        // It is the app's own default tier, which is what an unset model
        // resolves to anyway (config.js getActiveConfig).
        test.info().annotations.push({
          type: "cleanup",
          description: "model was unset before this run and is now set to the first offered tier (no un-set route exists)",
        });
      }
    }
  }
});
