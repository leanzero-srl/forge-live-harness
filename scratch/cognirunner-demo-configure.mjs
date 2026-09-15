// Standalone script (run with plain `node`, from ~/Projects/forge-live-harness so the
// @playwright/test import resolves). Configures CogniRunner's admin panel for real on
// leanzero-demo.atlassian.net, using the pre-authenticated persistent Chrome profile at
// PROFILE_PATH. Does NOT use the harness's test fixtures/targets (those point at
// wolfaenpak dev-env ids and a KVS test-hook that doesn't exist on leanzero-demo) — it
// drives the real DOM directly, following the UI mechanics proven in
// scenarios/cognirunner/{settings-provider,admin-ui-deep,docs-crud,skills-crud,memories-crud}.spec.ts
// and the CURRENT source in ~/Projects/CogniRunner/static/admin-panel/src/.
import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const PROFILE_PATH =
  "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-cognirunner";
const DEEP_LINK =
  "https://leanzero-demo.atlassian.net/jira/apps/36415848-6868-4697-9554-3c3ad87b8da9/37dd35f1-42db-4e65-8e91-b2f18caed58d";
const EVIDENCE_DIR = "/Users/mihaiperdum/Projects/leanzero-demo-instance/evidence/cognirunner";

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const FLAG_SUPPRESSOR_CSS =
  '#aui-flag-container, [data-testid="flag-group"], [data-testid$=".flag-group"], #jira-flags { pointer-events: none !important; }';

let shot = 0;
function shotPath(name) {
  shot += 1;
  return path.join(EVIDENCE_DIR, `${String(shot).padStart(2, "0")}-${name}.png`);
}

async function enterAdminFrame(page) {
  const sel = 'iframe[data-testid="hosted-resources-iframe"]';
  await page.locator(sel).first().waitFor({ state: "attached", timeout: 30000 });
  let frameLocator = null;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const count = await page.locator(sel).count();
    for (let i = 0; i < count; i++) {
      const loc = page.locator(sel).nth(i);
      const box = await loc.boundingBox().catch(() => null);
      if (box && box.width > 40 && box.height > 40) {
        const fl = loc.contentFrame();
        const txt = await fl.locator("body").textContent().catch(() => null);
        if (txt && txt.replace(/\s+/g, "").length > 0) {
          frameLocator = fl;
          break;
        }
      }
    }
    if (frameLocator) break;
    await page.waitForTimeout(400);
  }
  if (!frameLocator) frameLocator = page.locator(sel).first().contentFrame();
  await frameLocator.locator(".tab-btn").first().waitFor({ state: "visible", timeout: 20000 });
  return frameLocator;
}

async function clickTab(page, frame, label) {
  const btn = frame.locator(".tab-btn", { hasText: new RegExp(`^\\s*${label}\\s*$`) }).first();
  await btn.waitFor({ state: "visible", timeout: 15000 });
  await btn.click();
  await page.waitForTimeout(900); // let the tab body paint
}

async function main() {
  console.log("Launching persistent context...");
  const context = await chromium.launchPersistentContext(PROFILE_PATH, {
    headless: true,
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript((css) => {
    const inject = () => {
      if (document.getElementById("lz-script-flag-suppressor")) return;
      if (!document.head) return;
      const st = document.createElement("style");
      st.id = "lz-script-flag-suppressor";
      st.textContent = css;
      document.head.appendChild(st);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject, { once: true });
    else inject();
    setTimeout(inject, 2000);
  }, FLAG_SUPPRESSOR_CSS);

  const page = context.pages()[0] || (await context.newPage());
  const evidence = {};

  try {
    console.log("Navigating to CogniRunner admin deep link...");
    await page.goto(DEEP_LINK, { waitUntil: "domcontentloaded" });
    let frame = await enterAdminFrame(page);
    await page.screenshot({ path: shotPath("admin-loaded"), fullPage: true });
    console.log("Admin panel loaded, tab bar visible.");

    // ---------- 1. AI Provider ----------
    await clickTab(page, frame, "Settings");
    await frame.locator(".section-title", { hasText: /AI Provider Configuration/i }).first().waitFor({ state: "visible", timeout: 20000 });
    const activeLineBefore = (await frame.locator("p", { hasText: /Active:/ }).first().innerText()).trim();
    console.log("Provider — before:", activeLineBefore);
    evidence.providerBefore = activeLineBefore;
    await page.screenshot({ path: shotPath("settings-provider-before"), fullPage: true });

    const providerTrigger = () => frame.locator(".dropdown-trigger").first();
    await providerTrigger().click();
    await frame.locator(".dropdown-panel").first().waitFor({ state: "visible", timeout: 8000 });
    const optionTexts = await frame.locator(".dropdown-panel .dropdown-item-name").allInnerTexts();
    console.log("Provider options:", optionTexts);
    evidence.providerOptions = optionTexts;
    await page.screenshot({ path: shotPath("provider-dropdown-open"), fullPage: true });

    // View OpenAI (non-mutating) so "Set as active" appears for it.
    await frame.locator(".dropdown-panel .dropdown-item-name").filter({ hasText: /OpenAI/ }).first().click();
    await providerTrigger().waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: shotPath("viewing-openai"), fullPage: true });

    // Set OpenAI active — this is the ONLY way the UI exposes a genuine "Set as active"
    // write; we immediately swing back to Atlassian so the working default is restored,
    // but through a REAL commit rather than a client-side fallback.
    await frame.locator("button.btn-edit", { hasText: /Set as active/i }).first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shotPath("openai-set-active"), fullPage: true });

    await providerTrigger().click();
    await frame.locator(".dropdown-panel").first().waitFor({ state: "visible", timeout: 8000 });
    await frame.locator(".dropdown-panel .dropdown-item-name").filter({ hasText: /Atlassian/ }).first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: shotPath("viewing-atlassian"), fullPage: true });

    await frame.locator("button.btn-edit", { hasText: /Set as active/i }).first().click();
    await page.waitForTimeout(1500);
    const successMsg = await frame.locator(".alert-success").first().innerText().catch(() => null);
    console.log("Set-active success message:", successMsg);
    evidence.providerSetActiveMessage = successMsg;
    await page.screenshot({ path: shotPath("atlassian-set-active"), fullPage: true });

    // ---------- Reload + verify provider ----------
    console.log("Reloading (fresh navigation) to verify provider persisted...");
    await page.goto(DEEP_LINK, { waitUntil: "domcontentloaded" });
    frame = await enterAdminFrame(page);
    await clickTab(page, frame, "Settings");
    await frame.locator(".section-title", { hasText: /AI Provider Configuration/i }).first().waitFor({ state: "visible", timeout: 20000 });
    const activeLineAfter = (await frame.locator("p", { hasText: /Active:/ }).first().innerText()).trim();
    console.log("Provider — after reload:", activeLineAfter);
    evidence.providerAfterReload = activeLineAfter;
    await page.screenshot({ path: shotPath("provider-verified-after-reload"), fullPage: true });

    // ---------- 2. Documentation Library ----------
    await clickTab(page, frame, "Documentation");
    await frame.locator(".section-title", { hasText: /Documentation Library/i }).first().waitFor({ state: "visible", timeout: 15000 });
    const docsBefore = await frame.locator("table.table tbody tr").count().catch(() => 0);
    console.log("Docs before:", docsBefore);
    evidence.docsBefore = docsBefore;
    await page.screenshot({ path: shotPath("docs-tab-initial"), fullPage: true });

    const docsToAdd = [
      {
        title: "Harborlight Coding Standards — Language & Style",
        category: "General",
        content:
          "Harborlight engineering's coding standards apply across Atlas, Voyager, Helios, and Prism. Prefer explicit over clever: a reviewer who has never seen the code before should be able to follow it without a walkthrough. Every PR that changes production behavior needs a test that would have failed before the change and passes after it. No PR merges to a main branch without at least one human approval, in addition to automated checks. Commit messages explain why, not just what, since the diff already shows what changed.\n\nPer-stack style guides and enforcement:\n- Go (Atlas control plane): standard gofmt + golangci-lint, project ruleset. Enforced by pre-commit hook + CI.\n- Kotlin / Swift (Voyager): ktlint / SwiftLint, house rules in each repo's README. Enforced by CI.\n- Python (Helios, Prism): black + ruff, type hints required on public functions. Enforced by pre-commit hook + CI.\n- Terraform (all infra): terraform fmt, tflint, module structure per ADR-009. Enforced by CI plan check.\n\nWhen generating or reviewing code for Harborlight repos, match the stack's style guide above and keep changes explicit rather than clever. Source: ENG Confluence space, 'Coding Standards & Review Guidelines'.",
      },
      {
        title: "Harborlight PR Review Process & the CogniRunner AI Gate",
        category: "Business Rules",
        content:
          "Every Harborlight PR requires: a linked Jira issue, a description of what changed and why, and a passing CI run (lint, unit tests, and where applicable a Terraform plan). Reviewers are expected to respond within one business day. For anything touching the control plane or a shared library, a second reviewer from outside the immediate team is required.\n\nSeveral Harborlight workflows have a CogniRunner AI validator attached to the In Review -> Done transition, configured to check that risk-bearing changes include specific required content before the transition is allowed to complete -- for example, that a change to control-plane infrastructure includes a rollback plan in the issue description, or that a Model Review issue in Helios has an AI Review Verdict recorded before it can be marked Done. This is a deterministic gate that catches an omission before it reaches a human reviewer's queue, not a substitute for human review. It has already done its job on Atlas: a Story moving from In Review to Done was blocked by the validator for missing a rollback plan, which forced the author to add one before the transition would complete. Where CogniRunner enforces something automatically, treat that as the floor, not the ceiling -- human reviewers should still read for correctness, not just check that the gate went green. Source: ENG Confluence space, 'Coding Standards & Review Guidelines'.",
      },
      {
        title: "Harborlight Testing Expectations",
        category: "Business Rules",
        content:
          "Unit tests are required for all new logic at Harborlight; integration tests are required for anything that crosses a service boundary. Flaky tests get quarantined with a linked Technical Debt issue, not silently skipped. Atlas control plane changes additionally require a Terraform plan review and, for anything touching etcd or ingress configuration, a note in the PR about failure-mode impact given the known etcd leader election and cert rotation issues documented in the On-Call Runbook.\n\nWhen writing or reviewing a semantic post-function or validator for Atlas control-plane work, check for a linked test, a Terraform plan note where infra is touched, and (for etcd/ingress changes) an explicit failure-mode note before treating the change as review-ready. Source: ENG Confluence space, 'Coding Standards & Review Guidelines' + 'On-Call Runbook - Atlas Platform'.",
      },
    ];

    for (const doc of docsToAdd) {
      await frame.locator("button.btn-small", { hasText: /^\+\s*Add Document\s*$/ }).first().click();
      const addCard = frame.locator(".card.anim-rise").first();
      await addCard.locator("input.doc-input").waitFor({ state: "visible", timeout: 10000 });
      await addCard.locator("input.doc-input").fill(doc.title);
      await addCard.locator(".dropdown-trigger").first().click();
      await frame.locator(".dropdown-panel").first().waitFor({ state: "visible", timeout: 8000 });
      await frame.locator(".dropdown-panel .dropdown-item-name").filter({ hasText: new RegExp(`^${doc.category}$`) }).first().click();
      await addCard.locator("textarea").fill(doc.content);
      await addCard.locator("button.btn-small", { hasText: /^\s*Save\s*$/ }).first().click();
      await frame.locator("table.table td", { hasText: doc.title }).first().waitFor({ state: "visible", timeout: 20000 });
      console.log("Doc saved:", doc.title);
    }
    await page.screenshot({ path: shotPath("docs-added"), fullPage: true });

    console.log("Reloading (fresh navigation) to verify docs persisted...");
    await page.goto(DEEP_LINK, { waitUntil: "domcontentloaded" });
    frame = await enterAdminFrame(page);
    await clickTab(page, frame, "Documentation");
    await frame.locator(".section-title", { hasText: /Documentation Library/i }).first().waitFor({ state: "visible", timeout: 15000 });
    const docTitlesPresent = {};
    for (const doc of docsToAdd) {
      docTitlesPresent[doc.title] = await frame.locator("table.table td", { hasText: doc.title }).count();
    }
    console.log("Doc titles present after reload:", docTitlesPresent);
    evidence.docTitlesPresentAfterReload = docTitlesPresent;
    await page.screenshot({ path: shotPath("docs-after-reload"), fullPage: true });

    // ---------- 3. Skills ----------
    await clickTab(page, frame, "Skills");
    await frame.locator("button.btn-add-skill").first().waitFor({ state: "visible", timeout: 15000 });
    const skillsBefore = await frame.locator("table.table tbody tr").count().catch(() => 0);
    console.log("Skills before:", skillsBefore);
    evidence.skillsBefore = skillsBefore;
    await page.screenshot({ path: shotPath("skills-tab-initial"), fullPage: true });

    const skillsToAdd = [
      {
        name: "Atlas rollback plan gate",
        category: "Workflow Patterns",
        description:
          "Use when building or fixing a validator/condition on an Atlas (control-plane) workflow transition into Done, to check for a rollback plan.",
        instructions:
          "Harborlight's Atlas control-plane changes must include a rollback plan before a Story/Task can move from In Review to Done. When generating a validator or semantic post-function for this transition, check the issue description (or a linked field) for an explicit rollback plan: how to revert the infrastructure change if it fails in production (e.g. previous Terraform state to reapply, a feature flag to disable, DNS/traffic to roll back). If the change touches Terraform-managed infrastructure (see ADR-009) and no rollback plan is present, fail the transition with a clear message asking the author to add one. This mirrors a real incident on Atlas where the validator caught a Story missing a rollback plan and forced the author to add it before Done.",
      },
      {
        name: "Helios Model Review verdict gate",
        category: "Workflow Patterns",
        description:
          "Use when building or fixing a validator for Helios Model Review issues transitioning to Done, to require an AI Review Verdict.",
        instructions:
          "A Model Review issue in Helios must have an AI Review Verdict recorded before it can be marked Done. When generating a validator/condition for this transition, check that the AI Review Verdict field (or equivalent custom field holding the reviewer's verdict) is populated and non-empty before allowing the transition. If it is empty, block the transition with a message asking for the verdict to be recorded first. This is a deterministic floor, not a replacement for the human reviewer actually reading the model evaluation -- the verdict field should contain a real assessment, not a placeholder.",
      },
    ];

    for (const skill of skillsToAdd) {
      await frame.locator("button.btn-add-skill", { hasText: /New Skill/i }).first().click();
      const addCard = frame.locator(".card").first();
      await addCard.locator("input.input").first().waitFor({ state: "visible", timeout: 10000 });
      await addCard.locator("input.input").first().fill(skill.name);
      await addCard.locator(".dropdown-trigger").first().click();
      await frame.locator(".dropdown-panel").first().waitFor({ state: "visible", timeout: 8000 });
      await frame.locator(".dropdown-panel .dropdown-item-name").filter({ hasText: new RegExp(`^${skill.category}$`) }).first().click();
      const textareas = addCard.locator("textarea");
      await textareas.nth(0).fill(skill.description); // Description
      await textareas.nth(1).fill(skill.instructions); // Instructions
      await addCard.locator("button.btn-save-doc", { hasText: /Save Skill/i }).first().click();
      await frame.locator("*", { hasText: skill.name }).first().waitFor({ state: "visible", timeout: 20000 });
      console.log("Skill saved:", skill.name);
      await page.waitForTimeout(800);
    }
    await page.screenshot({ path: shotPath("skills-added"), fullPage: true });

    console.log("Reloading (fresh navigation) to verify skills persisted...");
    await page.goto(DEEP_LINK, { waitUntil: "domcontentloaded" });
    frame = await enterAdminFrame(page);
    await clickTab(page, frame, "Skills");
    await frame.locator("button.btn-add-skill").first().waitFor({ state: "visible", timeout: 15000 });
    const skillNamesPresent = {};
    for (const skill of skillsToAdd) {
      skillNamesPresent[skill.name] = await frame.locator("table.table td", { hasText: skill.name }).count();
    }
    console.log("Skill names present after reload:", skillNamesPresent);
    evidence.skillNamesPresentAfterReload = skillNamesPresent;
    await page.screenshot({ path: shotPath("skills-after-reload"), fullPage: true });

    // ---------- 4. Memories ----------
    await clickTab(page, frame, "Memories");
    await frame.locator("#mem-injection").waitFor({ state: "visible", timeout: 15000 });
    const readToggles = async () => ({
      autoCapture: await frame.locator("#mem-auto-capture").isChecked(),
      injection: await frame.locator("#mem-injection").isChecked(),
      runtimeInjection: await frame.locator("#mem-runtime-injection").isChecked(),
    });
    const togglesBefore = await readToggles();
    console.log("Memory toggles before:", togglesBefore);
    evidence.memoryTogglesBefore = togglesBefore;
    await page.screenshot({ path: shotPath("memories-tab-initial"), fullPage: true });

    // Force an EXPLICIT write for each toggle (flip, wait, flip back) so the sensible
    // defaults (autoCapture OFF, injection ON, runtimeInjection OFF — per CLAUDE.md /
    // memories.js) are genuinely persisted settings, not just the backend's fallback
    // for a key that was never written.
    async function flipAndRestore(id) {
      const el = frame.locator(id);
      await el.click();
      await page.waitForTimeout(1800);
      await el.click();
      await page.waitForTimeout(1800);
    }
    await flipAndRestore("#mem-injection");
    await flipAndRestore("#mem-auto-capture");
    await flipAndRestore("#mem-runtime-injection");

    const togglesAfterFlip = await readToggles();
    console.log("Memory toggles after flip-restore:", togglesAfterFlip);
    evidence.memoryTogglesAfterFlipRestore = togglesAfterFlip;
    await page.screenshot({ path: shotPath("memories-toggles-set"), fullPage: true });

    console.log("Reloading (fresh navigation) to verify memory settings persisted...");
    await page.goto(DEEP_LINK, { waitUntil: "domcontentloaded" });
    frame = await enterAdminFrame(page);
    await clickTab(page, frame, "Memories");
    await frame.locator("#mem-injection").waitFor({ state: "visible", timeout: 15000 });
    const togglesAfterReload = await readToggles();
    console.log("Memory toggles after reload:", togglesAfterReload);
    evidence.memoryTogglesAfterReload = togglesAfterReload;
    await page.screenshot({ path: shotPath("memories-verified-after-reload"), fullPage: true });

    fs.writeFileSync(path.join(EVIDENCE_DIR, "evidence-summary.json"), JSON.stringify(evidence, null, 2));
    console.log("DONE. Evidence summary written to evidence-summary.json");
  } catch (e) {
    console.error("ERROR:", e);
    try {
      await page.screenshot({ path: shotPath("ERROR-state"), fullPage: true });
    } catch {}
    throw e;
  } finally {
    await context.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
