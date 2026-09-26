// Offline proof of the per-run auth isolation contract (forge/auth-clone.mjs). No browser, no network.
//   node --test tests/run-isolation/
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cloneProfile, recoverOwnedClone, removeOwnedRun, sweepStaleRuns, ensureWorkerClone, STAMP } from "../../forge/auth-clone.mjs";

function fakeProfile(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "auth-clone-proof-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const src = path.join(root, "saved");
  fs.mkdirSync(path.join(src, "Default", "Cache"), { recursive: true });
  fs.mkdirSync(path.join(src, "Default", "Local Storage"), { recursive: true });
  fs.writeFileSync(path.join(src, "Default", "Cookies"), "cookie-db");
  fs.writeFileSync(path.join(src, "Default", "Local Storage", "leveldb"), "ls");
  fs.writeFileSync(path.join(src, "Default", "Cache", "blob"), "x".repeat(1000));
  fs.writeFileSync(path.join(src, "Local State"), "{}");
  // A LIVE owner's markers on the saved profile (another run is using it right now).
  fs.symlinkSync(`${os.hostname()}-${process.pid}`, path.join(src, "SingletonLock"));
  fs.symlinkSync("/tmp/some-owner-socket", path.join(src, "SingletonSocket"));
  const authDir = path.join(root, ".auth");
  fs.mkdirSync(path.join(authDir, "runs"), { recursive: true });
  return { root, src, authDir };
}
const deadPid = () => { const r = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"]); return Number(r.stdout.toString()); };

test("a clone carries the login state but never the owner's lock markers or caches, and is stamped", (t) => {
  const { src, authDir } = fakeProfile(t);
  const dest = path.join(authDir, "runs", "app-run1", "base");
  cloneProfile(src, dest, { app: "x" });
  assert.equal(fs.readFileSync(path.join(dest, "Default", "Cookies"), "utf8"), "cookie-db");
  assert.ok(fs.existsSync(path.join(dest, "Default", "Local Storage", "leveldb")));
  for (const m of ["SingletonLock", "SingletonSocket"]) assert.equal(fs.existsSync(path.join(dest, m)) || fs.lstatSync(path.join(dest, m), { throwIfNoEntry: false }) !== undefined, false, m);
  assert.equal(fs.existsSync(path.join(dest, "Default", "Cache")), false);
  assert.ok(fs.statSync(path.join(dest, STAMP)).isFile());
  // The saved profile is untouched: its live owner's markers are still there.
  assert.ok(fs.lstatSync(path.join(src, "SingletonLock")).isSymbolicLink());
  assert.throws(() => cloneProfile(src, dest), /AUTH_CLONE_EXISTS/);
});

test("stale-lock recovery touches only a stamped clone, and only when the owner is dead", (t) => {
  const { src, authDir } = fakeProfile(t);
  assert.throws(() => recoverOwnedClone(src), /NOT_A_RUN_CLONE/); // the SAVED profile is never recovered
  assert.ok(fs.lstatSync(path.join(src, "SingletonLock")));
  const w = path.join(authDir, "runs", "app-run2", "worker-0");
  cloneProfile(src, w);
  fs.symlinkSync(`${os.hostname()}-${process.pid}`, path.join(w, "SingletonLock"));
  assert.throws(() => recoverOwnedClone(w), /PROFILE_BUSY/); // live owner → nothing removed
  assert.ok(fs.lstatSync(path.join(w, "SingletonLock")));
  fs.rmSync(path.join(w, "SingletonLock"));
  fs.symlinkSync(`${os.hostname()}-${deadPid()}`, path.join(w, "SingletonLock"));
  fs.writeFileSync(path.join(w, "SingletonCookie"), "c");
  const r = recoverOwnedClone(w);
  assert.deepEqual(r.recovered.sort(), ["SingletonCookie", "SingletonLock"]);
  assert.equal(fs.lstatSync(path.join(w, "SingletonLock"), { throwIfNoEntry: false }), undefined);
});

test("worker clones come from the run's base; a reused worker dir is recovered, not re-cloned", (t) => {
  const { src, authDir } = fakeProfile(t);
  const run = path.join(authDir, "runs", "app-run3");
  cloneProfile(src, path.join(run, "base"));
  ensureWorkerClone(run, path.join(run, "worker-1"));
  assert.equal(JSON.parse(fs.readFileSync(path.join(run, "worker-1", STAMP), "utf8")).source, fs.realpathSync(path.join(run, "base")));
  assert.equal(ensureWorkerClone(run, path.join(run, "worker-1")).reused, true);
});

test("deletion is exact: only a run dir directly under runs/, and only when every child is stamped", (t) => {
  const { src, authDir, root } = fakeProfile(t);
  assert.throws(() => removeOwnedRun(authDir, src), /REFUSED/); // outside runs/
  const run = path.join(authDir, "runs", "app-run4");
  cloneProfile(src, path.join(run, "base"));
  fs.mkdirSync(path.join(run, "not-a-clone"));
  assert.throws(() => removeOwnedRun(authDir, run), /not a stamped run clone/);
  assert.ok(fs.existsSync(run));
  fs.rmSync(path.join(run, "not-a-clone"), { recursive: true });
  assert.equal(removeOwnedRun(authDir, run), true);
  assert.equal(fs.existsSync(run), false);
  assert.ok(fs.existsSync(src) && fs.existsSync(root));
});

test("the sweep removes only old runs whose creator is dead", (t) => {
  const { src, authDir } = fakeProfile(t);
  const old = path.join(authDir, "runs", "app-dead");
  const live = path.join(authDir, "runs", "app-live");
  const fresh = path.join(authDir, "runs", "app-fresh");
  cloneProfile(src, path.join(old, "base"));
  cloneProfile(src, path.join(live, "base"));
  cloneProfile(src, path.join(fresh, "base"));
  const stamp = (dir, pid, ageMs) => {
    const f = path.join(dir, "base", STAMP);
    const s = JSON.parse(fs.readFileSync(f, "utf8"));
    fs.writeFileSync(f, JSON.stringify({ ...s, pid, createdAt: new Date(Date.now() - ageMs).toISOString() }));
  };
  stamp(old, deadPid(), 2 * 3600e3);
  stamp(live, process.pid, 2 * 3600e3);
  stamp(fresh, deadPid(), 60e3);
  assert.deepEqual(sweepStaleRuns(authDir), ["app-dead"]);
  assert.ok(fs.existsSync(live) && fs.existsSync(fresh));
});
