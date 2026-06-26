// Zero-dependency .env loader (adapted from CogniRunner/test-harness/lib/env.mjs)
// so the REST data helpers run without `npm install`. Splits on the FIRST '='
// only — the Atlassian API token itself can contain '='.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const HARNESS_ROOT = join(HERE, ".."); // data/.. == repo root

function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

let loaded = null;
export function loadEnv() {
  if (loaded) return loaded;
  const envPath = join(HARNESS_ROOT, ".env");
  if (existsSync(envPath)) {
    const parsed = parseEnv(readFileSync(envPath, "utf8"));
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
  loaded = { ...process.env };
  return loaded;
}

export function requireEnv(name) {
  const env = loadEnv();
  const v = env[name];
  if (!v) throw new Error(`Required env var ${name} is not set (.env or environment).`);
  return v;
}
