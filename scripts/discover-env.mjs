// Verify / re-derive the Forge env IDs and Confluence spaces for the real targets.
// The harness already bakes the up-to-date DEVELOPMENT installs as defaults
// (config/targets.ts); use this to confirm them or to pick a different environment.
//
// Run: npm run discover    (requires `forge login`)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECTS = path.resolve(ROOT, "..");
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

function run(cmd, args, cwd) {
  try {
    return stripAnsi(execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch (e) {
    return stripAnsi(`${e.stdout || ""}${e.stderr || ""}\n[failed: ${cmd} ${args.join(" ")}]`);
  }
}

const APPS = [
  { name: "lz-ppm-forge (LeanZero Management)", dir: "lz-ppm-forge", envVar: "LZ_PPM_ENV_ID" },
  { name: "CogniRunner", dir: "CogniRunner", envVar: "COGNI_ENV_ID" },
  { name: "Sentinel Vault", dir: "Sentinel Vault", envVar: "SENTINEL_ENV_ID" },
];

console.log("forge whoami:\n" + run("forge", ["whoami"], ROOT).trim() + "\n");

for (const a of APPS) {
  const dir = path.join(PROJECTS, a.dir);
  console.log(`\n========== ${a.name} ==========`);
  if (!fs.existsSync(path.join(dir, "manifest.yml"))) { console.log("  (no manifest — skip)"); continue; }
  console.log("-- installs on wolfaenpak (pick the env + status you want) --");
  console.log(run("forge", ["install", "list"], dir).split("\n").filter((l) => /wolfaenpak|Environment|Status/.test(l)).join("\n"));
  console.log("-- environment IDs --");
  console.log(run("forge", ["environments", "list"], dir).split("\n").filter((l) => /[0-9a-f-]{36}|Type|Environment ID/.test(l)).join("\n"));
  console.log(`  → set ${a.envVar}=<the env id whose Type matches the install you use> (in .env, to override the baked default)`);
}

// Confluence spaces (for the Sentinel Vault space-page deep-link).
try {
  const { get } = await import("../data/jira.mjs");
  const r = await get("/wiki/rest/api/space?limit=25&type=global");
  console.log(`\n========== Confluence spaces on wolfaenpak (SENTINEL_SPACE_KEY) ==========`);
  for (const s of r.results || []) console.log(`  ${s.key}  |  ${s.name}`);
} catch (e) {
  console.log("\n(could not list Confluence spaces: " + e.message + ")");
}

console.log(`
Manual fallback (most reliable): open the app from the Apps menu on wolfaenpak and read the URL —
  Jira:        /jira/apps/{appUuid}/{ENV_ID}
  Confluence:  /wiki/spaces/{SPACE}/apps/{appUuid}/{ENV_ID}/realm-console
`);
