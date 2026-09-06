// MAINTENANCE: take every stored credential off this installation, and say
// where the page still mentions one.
//
// It exists because a live credential spec that dies mid-body leaves a REAL
// site-administrator token on a shared tenant — measured 6 Sep 2026, when the
// settings spec failed on its leak assertion after storing one and its
// `finally` could not get the card back to "No token". Every later spec then
// runs with an authority it never asked for, and the two credential specs
// refuse to start at all because they will not destroy a credential they
// cannot restore.
//
// It is also the DIAGNOSTIC for that failure: before removing anything it
// prints every line of the page that mentions the stored account email, with
// its neighbours, so "the email is in the DOM" becomes a place rather than a
// verdict. The token value itself is never printed, searched for in output, or
// interpolated into a message.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import {
  cardState,
  hasSecret,
  loadCredentialCopy,
  openAdminSettings,
  removeCredentialViaCard,
  secret,
} from "./admin-credentials-support";

const T = getTarget("chatwise-admin");

test.describe.configure({ timeout: 900_000 });

test("no credential is left stored on this installation", async ({ page }) => {
  test.skip(!T.envId, "env ids unresolved — run `npm run discover`.");
  const copy: any = await loadCredentialCopy();
  const cards = [copy.SITE_TOKEN_CARD, copy.ORG_KEY_CARD];

  await assertLoggedIn(page);
  const root = await openAdminSettings(page, T.deepLink(T.envId)!);

  for (const card of cards) {
    console.log(`[cleanup] "${card.heading}" state before = ${await cardState(root, card)}`);
  }

  // WHERE THE EMAIL IS, if it is anywhere. The site-token card's own copy calls
  // the address "not a secret and stored as typed", so a page that shows it
  // back is not automatically a defect — but a spec asserting it is absent has
  // to be answered with the place, not with an opinion.
  if (hasSecret(".site_email")) {
    const mail = secret(".site_email");
    const hits = await page.evaluate((m) => {
      const out: string[] = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (n.nodeValue && n.nodeValue.includes(m)) {
          const el = n.parentElement;
          out.push(
            `<${el?.tagName?.toLowerCase()} id="${el?.id || ""}"> …${n.nodeValue.trim().slice(0, 160)}`,
          );
        }
      }
      const inputs = Array.from(document.querySelectorAll("input"))
        .filter((i) => i.value.includes(m))
        .map((i) => `input#${i.id} type=${i.type}`);
      return { text: out, inputs, inHtml: document.documentElement.outerHTML.includes(m) };
    }, mail);
    console.log(
      `[cleanup] the stored account EMAIL appears in the page: html=${hits.inHtml} ` +
        `textNodes=${hits.text.length} inputs=${hits.inputs.length}\n` +
        hits.text.map((t) => `   ${t}`).join("\n") +
        (hits.inputs.length ? `\n   INPUTS: ${hits.inputs.join(", ")}` : ""),
    );
  }

  for (const card of cards) {
    const ok = await removeCredentialViaCard(root, card);
    const st = await cardState(root, card);
    console.log(`[cleanup] "${card.heading}" removed=${ok} state after = ${st}`);
    expect(
      st,
      `"${card.heading}" is still stored after Remove. A live site-administrator token or an ` +
        `organisation admin key left on a shared tenant hands every later run an authority it ` +
        `never asked for — take it off by hand on the ChatWise settings page.`,
    ).toBe("unconfigured");
  }
});
