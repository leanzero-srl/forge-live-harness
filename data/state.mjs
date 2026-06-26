// Shared run-state persisted to state/harness-state.json so discover / setup /
// scenarios hand off to each other (e.g. discovered envIds, seeded host-object
// keys). Contains NO secrets. Adapted from CogniRunner/test-harness/lib/state.mjs.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { HARNESS_ROOT } from "./env.mjs";

export const STATE_DIR = join(HARNESS_ROOT, "state");
const STATE_PATH = join(STATE_DIR, "harness-state.json");

export function ensureStateDir() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

export function loadState() {
  if (!existsSync(STATE_PATH)) return {};
  try { return JSON.parse(readFileSync(STATE_PATH, "utf8")); } catch { return {}; }
}

export function saveState(state) {
  ensureStateDir();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function patchState(patch) {
  const next = { ...loadState(), ...patch };
  saveState(next);
  return next;
}
