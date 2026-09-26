// Where the harness keeps its SECRETS (.env) and its SAVED LOGIN (.auth/).
//
// Both are gitignored, so they exist only in the MAIN checkout. A git worktree
// (the way parallel sessions work on this repo without touching each other's
// uncommitted edits) has neither — and every spec run from it used to die on
// "JIRA_API_TOKEN is not set" or on an empty .auth/profile. So:
//
//   1. HARNESS_HOME, when set, wins (a path to a checkout that holds .env/.auth).
//   2. The checkout this code lives in, when it has its own .env.
//   3. Otherwise, when this checkout is a git WORKTREE, the main checkout
//      (read from the `.git` file: "gitdir: <main>/.git/worktrees/<name>").
//   4. Otherwise this checkout (and the caller reports what is missing).
//
// Read-only resolution: nothing here creates, copies or modifies a file.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CODE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function mainCheckoutOf(root) {
  const dotGit = join(root, ".git");
  try {
    if (!statSync(dotGit).isFile()) return null; // a real .git dir → this IS the main checkout
    const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf8"));
    if (!m) return null;
    const gitdir = resolve(root, m[1].trim());
    // <main>/.git/worktrees/<name> → <main>
    const idx = gitdir.lastIndexOf(`${join(".git", "worktrees")}`);
    if (idx < 0) return null;
    return gitdir.slice(0, idx).replace(/[\\/]+$/, "");
  } catch {
    return null;
  }
}

let cached = null;
export function harnessHome() {
  if (cached) return cached;
  if (process.env.HARNESS_HOME) cached = resolve(process.env.HARNESS_HOME);
  else if (existsSync(join(CODE_ROOT, ".env"))) cached = CODE_ROOT;
  else cached = mainCheckoutOf(CODE_ROOT) ?? CODE_ROOT;
  return cached;
}
