# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/campaign-identity.spec.ts >> campaign: actual UI version and preserved LZPT source
- Location: scenarios/lz-ppm/campaign-identity.spec.ts:11:1

# Error details

```
Error: page.waitForTimeout: Page crashed
```

# Test source

```ts
  47  |     if (Number.isFinite(pid) && pid > 0) {
  48  |       try {
  49  |         process.kill(pid, 0);
  50  |         return; // a real process still holds the profile — leave everything alone
  51  |       } catch (e: any) {
  52  |         // ESRCH = no such process (stale). EPERM = alive but not ours; also leave it.
  53  |         if (e?.code !== "ESRCH") return;
  54  |       }
  55  |     }
  56  |   } catch {
  57  |     // No SingletonLock at all. RunningChromeVersion can still be lying around on its
  58  |     // own after a kill, and on its own it is enough to fail the launch — fall through.
  59  |   }
  60  |   for (const f of ["SingletonLock", "SingletonSocket", "SingletonCookie", "RunningChromeVersion"]) {
  61  |     try { fs.unlinkSync(`${dir}/${f}`); } catch { /* already gone */ }
  62  |   }
  63  | }
  64  | 
  65  | 
  66  | /**
  67  |  * HOST FLAG BANNERS SWALLOW CLICKS. Jira renders site notices into
  68  |  * `#aui-flag-container` (and the newer `[data-testid$="flag-group"]`) with a high
  69  |  * z-index, floating OVER the Forge iframe. Playwright's actionability check then
  70  |  * reports "<div class=aui-message…> intercepts pointer events" and every click
  71  |  * inside the app times out — a healthy app failing for a host reason. Measured
  72  |  * 2026-09-03 on wolfaenpak: an "Email notifications are off until 04/Sep/26"
  73  |  * evaluation notice blocked the entire Apply flow of two journeys.
  74  |  *
  75  |  * Installed as an INIT script so it survives every navigation and reload, and it
  76  |  * only removes the containers' ability to receive pointer events — the banner is
  77  |  * still visible in screenshots, so evidence stays honest.
  78  |  */
  79  | const FLAG_SUPPRESSOR_CSS = `#aui-flag-container, [data-testid="flag-group"], [data-testid$=".flag-group"], #jira-flags { pointer-events: none !important; }`;
  80  | 
  81  | export async function installHostFlagSuppressor(context: BrowserContext): Promise<void> {
  82  |   await context.addInitScript((css: string) => {
  83  |     const inject = () => {
  84  |       if (document.getElementById("lz-harness-flag-suppressor")) return;
  85  |       if (!document.head) return;
  86  |       const st = document.createElement("style");
  87  |       st.id = "lz-harness-flag-suppressor";
  88  |       st.textContent = css;
  89  |       document.head.appendChild(st);
  90  |     };
  91  |     if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject, { once: true });
  92  |     else inject();
  93  |     // Some hosts replace <head> late in boot; re-assert once the app has settled.
  94  |     setTimeout(inject, 2000);
  95  |     setTimeout(inject, 6000);
  96  |   }, FLAG_SUPPRESSOR_CSS).catch(() => {});
  97  | }
  98  | 
  99  | export async function launchHarnessContext(opts: LaunchOpts = {}): Promise<BrowserContext> {
  100 |   fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  101 |   clearStaleProfileLocks(USER_DATA_DIR);
  102 |   const headless = opts.headed === true ? false : opts.headed === false ? true : HEADLESS;
  103 |   const common: Parameters<typeof chromium.launchPersistentContext>[1] = {
  104 |     headless,
  105 |     viewport: VIEWPORT,
  106 |     args: ["--no-first-run", "--no-default-browser-check"],
  107 |   };
  108 |   if (opts.recordVideoDir) common.recordVideo = { dir: opts.recordVideoDir, size: VIEWPORT };
  109 |   // Prefer system Chrome (stable, matches a human's browser); fall back to the
  110 |   // bundled Chromium if Chrome isn't installed.
  111 |   //
  112 |   // One retry after a lock sweep: a launch that dies part-way writes its own markers on
  113 |   // the way out, so the second attempt is the one that gets a clean profile. Without it
  114 |   // the very failure this function cleans up after is left for the next process to find.
  115 |   for (let attempt = 0; attempt < 2; attempt++) {
  116 |     try {
  117 |       const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { channel: "chrome", ...common });
  118 |       await installHostFlagSuppressor(ctx);
  119 |       return ctx;
  120 |     } catch (chromeErr) {
  121 |       try {
  122 |         const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, common);
  123 |         await installHostFlagSuppressor(ctx);
  124 |         return ctx;
  125 |       } catch (chromiumErr) {
  126 |         if (attempt === 1) throw chromiumErr;
  127 |         clearStaleProfileLocks(USER_DATA_DIR);
  128 |         await new Promise((r) => setTimeout(r, 2000));
  129 |       }
  130 |     }
  131 |   }
  132 |   throw new Error("unreachable");
  133 | }
  134 | 
  135 | /** Export a portable storageState snapshot (the profile remains the primary store). */
  136 | export async function exportStorageState(context: BrowserContext): Promise<void> {
  137 |   await context.storageState({ path: STORAGE_STATE });
  138 | }
  139 | 
  140 | /**
  141 |  * Fast-fail session check. Navigates to a protected page; if redirected to the
  142 |  * Atlassian login, throws a clear "run npm run auth" error instead of letting the
  143 |  * scenario die deep inside an iframe wait.
  144 |  */
  145 | export async function assertLoggedIn(page: Page): Promise<void> {
  146 |   await page.goto(`${BASE_URL}/jira/your-work`, { waitUntil: "domcontentloaded" }).catch(() => {});
> 147 |   await page.waitForTimeout(600);
      |              ^ Error: page.waitForTimeout: Page crashed
  148 |   if (LOGIN_URL_RE.test(page.url())) {
  149 |     throw new Error(
  150 |       `Atlassian session expired (redirected to ${page.url()}). Run \`npm run auth\` to log in again.`,
  151 |     );
  152 |   }
  153 |   // Soft confirmation — selector skins vary, so a non-match is only fatal if we
  154 |   // can also see we're on a login URL.
  155 |   const ok = await page.locator(LOGIN_PROBE).first().isVisible({ timeout: 4000 }).catch(() => false);
  156 |   if (!ok && LOGIN_URL_RE.test(page.url())) {
  157 |     throw new Error("Atlassian session appears expired. Run `npm run auth`.");
  158 |   }
  159 | }
  160 | 
  161 | /**
  162 |  * Remove HOST-level flag banners that float over the page and swallow clicks.
  163 |  *
  164 |  * Jira renders site notices into `#aui-flag-container` / `[data-testid$="flag-group"]`
  165 |  * with a high z-index. They sit ON TOP of the Forge iframe, so Playwright's
  166 |  * actionability check reports "<div class=aui-message…> intercepts pointer events"
  167 |  * and every click inside the app times out — a green app failing for a host reason.
  168 |  * (Measured 2026-09-03 on wolfaenpak: an "Email notifications are off until …"
  169 |  * evaluation-plan notice blocked the whole Apply flow.)
  170 |  *
  171 |  * Only host chrome is removed; the app's own DOM lives inside the iframe and is
  172 |  * never touched. Safe to call repeatedly.
  173 |  */
  174 | export async function dismissHostFlags(page: Page): Promise<number> {
  175 |   return page.evaluate(() => {
  176 |     const sels = ["#aui-flag-container", '[data-testid="flag-group"]', '[data-testid$=".flag-group"]', "#jira-flags"];
  177 |     let n = 0;
  178 |     for (const sel of sels) {
  179 |       for (const el of Array.from(document.querySelectorAll(sel))) {
  180 |         if (el.childElementCount === 0) continue;
  181 |         el.remove();
  182 |         n++;
  183 |       }
  184 |     }
  185 |     return n;
  186 |   }).catch(() => 0);
  187 | }
  188 | 
```