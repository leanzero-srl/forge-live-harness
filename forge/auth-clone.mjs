// PER-RUN AUTH ISOLATION.
//
// The saved login is ONE persistent Chrome profile (.auth/profile, captured headed with 2FA by
// `npm run auth`). Two runs that open it at once collide on Chrome's profile lock, and a crashed
// run leaves Singleton* markers that block the next one. So a runner-driven run never opens the
// saved profile at all: it CLONES it into a directory that belongs to that run alone, launches
// headless on the clone, and deletes the clone afterwards.
//
//   <home>/.auth/runs/<app>-<runId>/base                  cloned by the runner; the preflight proves it alive
//   <home>/.auth/runs/<app>-<runId>/worker-<N>            cloned from base by the fixture, one per worker
//                                                          process (N = TEST_WORKER_INDEX, new on restart)
//
// Why a clone and not a bare storage-state.json in a fresh context: the profile carries the device
// identity (cookies + local storage) that the interactive login established, so reuse does not look
// like a new device; headless never logs in (a headless login meets 2FA and cannot pass it).
//
// SAFETY CONTRACT (each rule is load-bearing):
//   - The saved profile is only READ (copied). Nothing here writes, locks or unlinks inside it.
//   - Chrome's Singleton* markers are never copied into a clone, so a live owner of the saved
//     profile cannot make the clone hand its launch over to that other Chrome (SingletonSocket
//     is a symlink to the owner's socket).
//   - Stale-lock recovery (`recoverOwnedClone`) only touches a directory carrying this module's
//     ownership stamp, and only when the recorded owner pid is dead.
//   - Deletion (`removeOwnedRun`) only removes a directory under <home>/.auth/runs/ that carries
//     the stamp. No globbing, no process killing.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const STAMP = ".harness-run-clone.json";
const MARKERS = ["SingletonLock", "SingletonSocket", "SingletonCookie", "RunningChromeVersion"];
// Regenerable caches: skipping them makes a non-CoW copy ~10x smaller and loses no login state.
const SKIP_DIRS = new Set([
  "Cache", "Code Cache", "GPUCache", "GrShaderCache", "GraphiteDawnCache", "GPUPersistentCache",
  "ShaderCache", "DawnCache", "DawnGraphiteCache", "DawnWebGPUCache", "component_crx_cache",
  "extensions_crx_cache", "Crashpad", "BrowserMetrics", "optimization_guide_model_store",
  "OptimizationGuidePredictionModels", "Safe Browsing", "segmentation_platform", "CacheStorage",
  "ScriptCache",
]);

export function runsRoot(authDir) {
  return path.join(authDir, "runs");
}

/** Copy `source` (the saved profile) into `dest` (must not exist). Returns {ms}. */
export function cloneProfile(source, dest, meta = {}) {
  const src = fs.realpathSync(source);
  if (!fs.existsSync(path.join(src, "Default")) && !fs.existsSync(path.join(src, "Local State"))) {
    throw new Error(`AUTH_SOURCE_EMPTY: ${src} is not a Chrome profile (no Default/ or Local State). Run \`npm run auth\` (headed, owner) first.`);
  }
  if (fs.existsSync(dest)) throw new Error(`AUTH_CLONE_EXISTS: ${dest} already exists — refusing to reuse another run's clone`);
  fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
  const t0 = Date.now();
  // COPYFILE_FICLONE: an APFS/btrfs copy-on-write clone when the volume supports it (instant,
  // zero extra space), a plain byte copy otherwise.
  fs.cpSync(src, dest, {
    recursive: true,
    force: false,
    errorOnExist: true,
    verbatimSymlinks: true,
    mode: fs.constants.COPYFILE_FICLONE,
    filter: (from) => {
      const base = path.basename(from);
      if (MARKERS.includes(base)) return false;
      if (SKIP_DIRS.has(base)) return false;
      // Chrome sockets/fifos cannot be copied and are never state.
      try { const st = fs.lstatSync(from); if (st.isSocket() || st.isFIFO()) return false; } catch { return false; }
      return true;
    },
  });
  fs.writeFileSync(path.join(dest, STAMP), JSON.stringify({ source: src, createdAt: new Date().toISOString(), host: os.hostname(), pid: process.pid, ...meta }, null, 2), { mode: 0o600 });
  return { ms: Date.now() - t0 };
}

function isOwnedClone(dir) {
  try { return fs.statSync(path.join(dir, STAMP)).isFile(); } catch { return false; }
}

/**
 * Stale-lock recovery for a RUN-OWNED clone only. A worker that crashed leaves Singleton*
 * markers; anything that relaunches on that same dir (a reused worker dir, `--keep-auth-clone`,
 * a preflight retry on base) would then refuse the profile.
 * Removes the markers iff the dir is stamped as a clone AND the owner pid in SingletonLock is dead
 * (or unreadable). A live owner → throws PROFILE_BUSY and removes nothing.
 */
export function recoverOwnedClone(dir) {
  if (!isOwnedClone(dir)) throw new Error(`NOT_A_RUN_CLONE: ${dir} has no ${STAMP}; refusing to touch its lock markers`);
  const present = MARKERS.filter((m) => { try { fs.lstatSync(path.join(dir, m)); return true; } catch { return false; } });
  if (!present.length) return { recovered: [] };
  let pid = null;
  try {
    const target = fs.readlinkSync(path.join(dir, "SingletonLock"));
    const m = /-(\d+)$/.exec(target);
    if (m) pid = Number(m[1]);
  } catch { /* no readable lock → treat as stale */ }
  if (pid) {
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch (e) { alive = e && e.code === "EPERM"; }
    if (alive) throw new Error(`PROFILE_BUSY: run clone ${dir} is held by live pid ${pid}`);
  }
  for (const m of present) fs.rmSync(path.join(dir, m), { force: true });
  return { recovered: present, deadOwner: pid };
}

/** Remove one run's clone directory (the `<app>-<runId>` dir). Stamp-checked, exact path. */
export function removeOwnedRun(authDir, runDir) {
  const root = fs.realpathSync(runsRoot(authDir));
  let real;
  try { real = fs.realpathSync(runDir); } catch { return false; }
  if (path.dirname(real) !== root) throw new Error(`REFUSED: ${runDir} is not directly under ${root}`);
  const kids = fs.readdirSync(real);
  for (const k of kids) {
    const p = path.join(real, k);
    if (!isOwnedClone(p)) throw new Error(`REFUSED: ${p} is not a stamped run clone; leaving ${real} in place`);
  }
  fs.rmSync(real, { recursive: true, force: true });
  return true;
}

/**
 * FAST-FAIL SESSION CHECK on a clone. Launches headless on the clone, asks Jira who we are with the
 * profile's cookies. 200 + accountId = alive. 401/403 or a login redirect = the saved login is dead,
 * and only the owner can renew it (`npm run auth` is headed and needs his 2FA).
 */
export async function checkSession({ chromium, profileDir, baseUrl, headless = true }) {
  const opts = { headless, viewport: { width: 1280, height: 800 }, args: ["--no-first-run", "--no-default-browser-check"] };
  let ctx;
  try { ctx = await chromium.launchPersistentContext(profileDir, { channel: "chrome", ...opts }); }
  catch (e) {
    if (!String(e && e.message).includes("Chromium distribution 'chrome' is not found")) throw e;
    ctx = await chromium.launchPersistentContext(profileDir, opts);
  }
  try {
    const r = await ctx.request.get(`${baseUrl}/rest/api/3/myself`, { maxRedirects: 0, timeout: 30_000, failOnStatusCode: false });
    const status = r.status();
    let body = null;
    try { body = await r.json(); } catch { /* html login page */ }
    if (status === 200 && body && body.accountId) {
      return { ok: true, status, accountId: body.accountId, displayName: body.displayName ?? null };
    }
    return { ok: false, status, reason: status === 401 || status === 403 || (status >= 300 && status < 400) ? "session-expired" : `unexpected-${status}` };
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * The per-WORKER clone, made lazily by the fixture when its worker starts. Cloned from the run's
 * validated `base` clone (never from the saved profile directly, so every worker of one run acts on
 * the same session snapshot the preflight proved alive). A restarted worker gets a new
 * TEST_WORKER_INDEX and therefore a brand-new clone; an existing dir (a reused index) goes through
 * the stamp-checked stale-lock recovery first.
 */
export function ensureWorkerClone(runAuthDir, workerDir) {
  if (fs.existsSync(workerDir)) return { reused: true, ...recoverOwnedClone(workerDir) };
  return cloneProfile(path.join(runAuthDir, "base"), workerDir, { worker: path.basename(workerDir) });
}

/**
 * Remove run clone dirs left behind by a runner that was SIGKILLed (its `finally` never ran).
 * Only dirs directly under <authDir>/runs whose `base` stamp names a DEAD pid on THIS host and that
 * are older than `minAgeMs`; each goes through the stamp-checked removeOwnedRun. Returns what it removed.
 */
export function sweepStaleRuns(authDir, minAgeMs = 60 * 60 * 1000) {
  const root = runsRoot(authDir);
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return []; }
  const removed = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(root, e.name);
    let stamp;
    try { stamp = JSON.parse(fs.readFileSync(path.join(dir, "base", STAMP), "utf8")); } catch { continue; }
    if (stamp.host !== os.hostname() || !stamp.pid) continue;
    if (Date.now() - Date.parse(stamp.createdAt) < minAgeMs) continue;
    let alive = false;
    try { process.kill(stamp.pid, 0); alive = true; } catch (err) { alive = err && err.code === "EPERM"; }
    if (alive) continue;
    try { if (removeOwnedRun(authDir, dir)) removed.push(e.name); } catch { /* not ours to delete */ }
  }
  return removed;
}
