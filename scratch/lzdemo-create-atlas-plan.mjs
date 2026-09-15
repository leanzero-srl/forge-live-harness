// Creates a REAL plan on leanzero-demo.atlassian.net for LeanZero Management (lz-ppm-forge),
// sourced from real Jira data: project = ATLAS (23 issues, epics/stories/tasks, story points,
// issue links). Drives the actual "New Plan" wizard end to end via the pre-authenticated
// persistent Chrome profile. Screenshots each step into evidence/lz-ppm/.
import { chromium } from "@playwright/test";

const PROFILE_PATH = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm";
const APP_URL = "https://leanzero-demo.atlassian.net/jira/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/5c1c7532-62a8-4970-bd2c-11f909c06092";
const SHOT_DIR = "/Users/mihaiperdum/Projects/leanzero-demo-instance/evidence/lz-ppm";
const PLAN_NAME = "ATLAS Portfolio Plan";
const JQL = "project = ATLAS ORDER BY key ASC";

async function bodyText(frame) {
  return (await frame.locator("body").innerText().catch(() => "")) || "";
}

async function dismissHostFlags(page) {
  await page.evaluate(() => {
    const sels = ["#aui-flag-container", '[data-testid="flag-group"]', '[data-testid$=".flag-group"]', "#jira-flags"];
    for (const sel of sels) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        if (el.childElementCount === 0) continue;
        el.remove();
      }
    }
  }).catch(() => {});
}

async function enterForgeSurface(page, timeout = 30000) {
  await dismissHostFlags(page);
  const sel = 'iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]';
  await page.locator(sel).first().waitFor({ state: "attached", timeout });
  const frame = page.locator(sel).first().contentFrame();
  return frame;
}

const context = await chromium.launchPersistentContext(PROFILE_PATH, {
  headless: true,
  viewport: { width: 1600, height: 1000 },
});

let step = 0;
async function shot(page, frame, name) {
  step += 1;
  const path = `${SHOT_DIR}/${String(step).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log("SHOT:", path);
}

try {
  const page = context.pages()[0] || (await context.newPage());
  console.log("=== Navigating to LeanZero Management global page ===");
  await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1500);
  let frame = await enterForgeSurface(page);
  await page.waitForTimeout(2000);
  await shot(page, frame, "plans-list-before");

  console.log("=== Clicking + New Plan ===");
  await frame.getByRole("button", { name: /New Plan/i }).first().click().catch(async () => {
    await frame.getByText(/New plan/i).first().click();
  });
  await page.waitForTimeout(1500);
  await shot(page, frame, "wizard-step1-name");

  console.log("=== Step 1: Name ===");
  const nameInput = frame.getByPlaceholder(/Q2 Release Plan/i).first();
  await nameInput.waitFor({ state: "visible", timeout: 15000 });
  await nameInput.fill(PLAN_NAME);
  await page.waitForTimeout(500);
  const continueBtn = () => frame.getByRole("button", { name: /Continue/i }).first();
  console.log("Continue enabled after name:", await continueBtn().isEnabled().catch(() => null));
  await continueBtn().click();
  await page.waitForTimeout(1200);
  await shot(page, frame, "wizard-step2-sources");

  console.log("=== Step 2: Sources (JQL) ===");
  const bodyStep2 = await bodyText(frame);
  console.log("STEP2 BODY (first 400):", bodyStep2.slice(0, 400));
  const jqlInput = frame.getByPlaceholder(/project = PROJ/i).first();
  const jqlVisible = await jqlInput.isVisible().catch(() => false);
  console.log("JQL input visible:", jqlVisible);
  if (jqlVisible) {
    await jqlInput.fill(JQL);
    await frame.getByText(/✓ Valid/i).first().waitFor({ state: "visible", timeout: 15000 }).catch(async (e) => {
      console.log("Did not see ✓ Valid, checking body:", (await bodyText(frame)).slice(0, 600));
    });
    await page.waitForTimeout(1000);
  }
  await shot(page, frame, "wizard-step2-jql-filled");
  console.log("Continue enabled after JQL:", await continueBtn().isEnabled().catch(() => null));
  await continueBtn().click();
  await page.waitForTimeout(1200);
  await shot(page, frame, "wizard-step3-schedule");

  console.log("=== Step 3: Schedule (defaults) ===");
  console.log("STEP3 BODY (first 500):", (await bodyText(frame)).slice(0, 500));
  await continueBtn().click();
  await page.waitForTimeout(1200);
  await shot(page, frame, "wizard-step4-milestones");

  console.log("=== Step 4: Milestones (skip) ===");
  console.log("STEP4 BODY (first 500):", (await bodyText(frame)).slice(0, 500));
  await continueBtn().click().catch(async () => {
    // maybe this step's continue has a different name
    console.log("Default continue failed on step4, trying alternate");
  });
  await page.waitForTimeout(1200);
  await shot(page, frame, "wizard-step5-review-or-create");

  console.log("=== Final step: Create & Index ===");
  const finalBody = await bodyText(frame);
  console.log("FINAL STEP BODY (first 800):", finalBody.slice(0, 800));
  const createBtn = frame.getByRole("button", { name: /Create\s*&?\s*Index/i }).first();
  const createVisible = await createBtn.isVisible().catch(() => false);
  console.log("Create & Index button visible:", createVisible);
  if (createVisible) {
    await createBtn.click();
  } else {
    // Maybe still on schedule/milestones; try clicking Continue again then look for Create
    await continueBtn().click().catch(() => {});
    await page.waitForTimeout(1000);
    await frame.getByRole("button", { name: /Create\s*&?\s*Index/i }).first().click().catch((e) => {
      console.log("Could not find Create & Index button:", e.message);
    });
  }
  await page.waitForTimeout(2000);
  await shot(page, frame, "after-create-click");

  console.log("=== Waiting for plan to open / index ===");
  let opened = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(3000);
    const txt = await bodyText(frame);
    if (/Gantt|Table/i.test(txt) && !/Indexing|Creating/i.test(txt)) { opened = true; break; }
    if (i % 5 === 0) console.log(`  ...waiting (${i * 3}s), body snippet:`, txt.slice(0, 200).replace(/\n+/g, " | "));
  }
  console.log("Plan opened:", opened);
  await shot(page, frame, "plan-opened");

  const finalTxt = await bodyText(frame);
  console.log("PLAN VIEW BODY (first 1000):", finalTxt.slice(0, 1000));

  console.log("DONE_CREATE_SCRIPT");
} catch (err) {
  console.error("SCRIPT ERROR:", err);
  process.exitCode = 1;
} finally {
  await context.close();
}
