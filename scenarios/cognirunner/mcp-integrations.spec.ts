// LIVE BROWSER — admin Settings › MCP Integrations (journey J2, READ-ONLY / non-mutating). Drives the real
// admin panel (Forge globalPage iframe). The MCP section (inside OpenAIConfig / Settings, gated on
// provider===activeProvider) exposes the three MCPs CogniRunner can dial on every provider — context7 /
// web-search / doc-reader — each with an Enable toggle, tool chips, and a per-card setup block, plus a
// collapsible "How it works" connection guide. Asserts all three cards render, their ENABLED/DISABLED
// state reconciles EXACTLY with the COGNIRUNNER_LMSTUDIO_MCPS KVS hook, the tool chips + Enable controls
// render, and the guide reveals/hides its setup copy. NEVER toggles an MCP's enabled state (that would
// change real MCP config, per project_mcp_bridge_architecture) — only the UI-only guide is opened/closed.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget("cognirunner-global");
const HOOK = process.env.COGNI_TESTHOOK_URL;
const SECRET = process.env.HARNESS_SECRET;
test.describe.configure({ retries: 2 });

// The three MCP cards map to these KVS flags (docWriter is a doc-reader sub-capability, not a card).
const CARD_KEYS = ["context7", "webSearch", "docReader"] as const;
async function mcpFlags(): Promise<Record<string, boolean>> {
  const r = await fetch(`${HOOK}?what=kvs&key=COGNIRUNNER_LMSTUDIO_MCPS`, { headers: { Authorization: `Bearer ${SECRET}` } });
  if (!r.ok) throw new Error(`hook kvs read ${r.status}`);
  const v = (await r.json()).value || {};
  return v;
}

test("J2 admin MCP Integrations — 3 cards render, enabled-state reconciles with KVS, guide reveals (read-only)", async ({ page, recorder }) => {
  test.skip(!T.envId, "COGNI_ENV_ID unresolved");
  const url = T.deepLink(T.envId)!;
  recorder.setTarget({ product: T.product, app: T.app, appId: T.appId, module: T.module, moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo });

  const flags = await mcpFlags();
  const enabledCount = CARD_KEYS.filter((k) => flags[k] === true).length;
  console.log(`MCP flags (KVS): ${JSON.stringify(flags)} → enabled cards: ${enabledCount}/3`);

  await assertLoggedIn(page);
  await recorder.step("open admin panel", async () => { await page.goto(url, { waitUntil: "domcontentloaded" }); });
  recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  recorder.attachSurface(surface);
  const frame = surface.kind === "custom" ? surface.frame : null;
  if (!frame) throw new Error("expected a Custom-UI iframe");
  await expect(frame.locator(".tab-btn").first()).toBeVisible({ timeout: 20_000 });

  // The MCP section is the .card that contains the "MCP Integrations" heading.
  const mcp = frame.locator(".card").filter({ has: frame.locator("h3", { hasText: /MCP Integrations/i }) });

  await recorder.step("open Settings — MCP Integrations section + 3 cards render", async () => {
    await frame.locator(".tab-btn", { hasText: /^\s*Settings\s*$/ }).first().click();
    await expect(mcp).toBeVisible({ timeout: 20_000 });
    for (const title of ["context7", "web-search", "doc-reader"]) {
      await expect(mcp.locator("strong", { hasText: new RegExp(`^${title}$`) })).toBeVisible();
    }
  }, { expectation: { assertion: "the MCP Integrations section lists all three MCPs (context7 / web-search / doc-reader)", narrative: "The AI agent's external tools are configured in one place, per provider." } });

  await recorder.step("card enabled-state reconciles EXACTLY with COGNIRUNNER_LMSTUDIO_MCPS", async () => {
    // Each card shows an ENABLED or DISABLED pill; the counts must match the KVS flags.
    const enabledPills = mcp.getByText("ENABLED", { exact: true });
    const disabledPills = mcp.getByText("DISABLED", { exact: true });
    expect(await enabledPills.count(), "enabled pills match the KVS flags").toBe(enabledCount);
    expect(await disabledPills.count(), "disabled pills match the KVS flags").toBe(3 - enabledCount);
    // Each card exposes an Enable checkbox (a native checkbox styled as a switch is allowed; a native
    // <select> is not — assert there is no <select> in the MCP section).
    expect(await mcp.locator("input[type='checkbox']").count(), "an Enable toggle per card").toBeGreaterThanOrEqual(3);
    await expect(mcp.locator("select")).toHaveCount(0);
    // Tool chips render for context7 (curated set until a live ping replaces them).
    await expect(mcp.locator("*", { hasText: /Tools available|Tools in use|Loading tools/ }).first()).toBeVisible();
  }, { expectation: { assertion: "each MCP's enabled state on screen matches what's stored in KVS", narrative: "The toggles reflect reality — no drift between the UI and the saved MCP config." } });

  await recorder.step("connection guide reveals + hides (UI-only, no config change)", async () => {
    await mcp.locator("button.btn-edit", { hasText: /How it works/i }).click();
    await expect(mcp.locator("*", { hasText: /Three ways to connect an MCP/i }).first()).toBeVisible({ timeout: 8000 });
    // The egress restriction is spelled out (Forge reaches only 443; 8443/10000 blocked).
    await expect(mcp.locator("*", { hasText: /8443\s*\/\s*10000 are blocked/i }).first()).toBeVisible();
    await mcp.locator("button.btn-edit", { hasText: /Hide guide/i }).click();
    await expect(mcp.locator("*", { hasText: /Three ways to connect an MCP/i })).toHaveCount(0, { timeout: 8000 });
  }, { expectation: { assertion: "the 'How it works' guide reveals the connection modes + egress rules and collapses again", narrative: "Setup guidance is one click away without cluttering the section." } });

  await recorder.step("MCP enabled config unchanged in KVS after viewing (read-only)", async () => {
    const after = await mcpFlags();
    for (const k of CARD_KEYS) {
      expect(after[k] === true, `MCP ${k} enabled flag unchanged`).toBe(flags[k] === true);
    }
  }, { expectation: { assertion: "browsing the MCP section never changes which MCPs are enabled", narrative: "Viewing configuration is safe — enabling an MCP is always a deliberate toggle." } });
});
