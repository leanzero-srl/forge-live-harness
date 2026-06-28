// Registry of apps-under-test (your real apps on wolfaenpak). The env IDs below
// are the UP-TO-DATE development installs on wolfaenpak (verified via
// `forge install list`); override per-app in .env if you want prod/staging.
import path from "node:path";
import { deeplink } from "../forge/deeplink";
import { REPO_ROOT } from "./env";

export interface Target {
  id: string;
  product: "jira" | "confluence";
  app: string; // friendly name
  appId: string; // ARI or bare UUID
  envId: string; // Forge environment UUID for the deep-link
  module: string; // manifest module key
  moduleType: string; // e.g. jira:globalPage
  surface: "custom" | "uikit";
  /** Build the deep-link path; null = not deep-linkable (use forge/host.ts). */
  deepLink: (envId: string) => string | null;
  /** Selector that proves the app booted, evaluated INSIDE the surface (optional). */
  readySelector?: string;
  /** App-under-test repo, so the assessor can confirm file/line fix hints. */
  repo: string;
}

const PROJECTS = path.resolve(REPO_ROOT, "..");

// --- lz-ppm-forge ("LeanZero Management") — Jira global page ---
const LZ_PPM_APP = "ari:cloud:ecosystem::app/087a8e18-d45a-4cb7-9d87-3e84101ac4f3";
const LZ_PPM_ENV = process.env.LZ_PPM_ENV_ID || "d6096af9-3082-4ee1-a05e-f8b61d766b77"; // development

// --- CogniRunner — Jira global page (admin panel) ---
const COGNI_APP = "ari:cloud:ecosystem::app/36415848-6868-4697-9554-3c3ad87b8da9";
const COGNI_ENV = process.env.COGNI_ENV_ID || "989ecaa0-261b-406e-b444-78c01c0d7772"; // development (up-to-date)

// --- Sentinel Vault — Confluence space page (realm-console) ---
const SENTINEL_APP = "ari:cloud:ecosystem::app/c30bf71e-4287-4872-954d-db49cc68f0ff";
const SENTINEL_ENV = process.env.SENTINEL_ENV_ID || "17516615-12ef-4790-8ce2-29151b7ee9ac"; // development
const SENTINEL_SPACE = process.env.SENTINEL_SPACE_KEY || "WFH"; // any wolfaenpak space (DEMO/JT/WFH)
const SENTINEL_ROUTE = "realm-console";

// --- Altomata — Jira global page ("hub") on wolfaenpak (also installed on alterdomus-sandbox) ---
const ALTOMATA_APP = process.env.ALTOMATA_APP_ID || "ari:cloud:ecosystem::app/8513392b-129b-4ad1-9b09-811804ca5705";
const ALTOMATA_ENV = process.env.ALTOMATA_ENV_ID || "244ac2e9-6cbb-4012-99ae-1f958fc9309c"; // development

// --- License Leash — Confluence self-service reactivation page (globalPage) on wolfaenpak ---
const LICENSELEASH_APP = process.env.LICENSELEASH_APP_ID || "ari:cloud:ecosystem::app/6b49e96c-37c4-4711-a604-08d8a47c8f1a";
const LICENSELEASH_ENV = process.env.LICENSELEASH_ENV_ID || "8910540b-8f3e-43e5-8e5b-7ee7bd9cdce4"; // development

export const TARGETS: Record<string, Target> = {
  "lz-ppm-dashboard": {
    id: "lz-ppm-dashboard",
    product: "jira",
    app: "LeanZero Management (lz-ppm-forge)",
    appId: LZ_PPM_APP,
    envId: LZ_PPM_ENV,
    module: "ppm-dashboard",
    moduleType: "jira:globalPage",
    surface: "custom",
    deepLink: (env) => deeplink.jiraGlobalPage(LZ_PPM_APP, env),
    repo: path.join(PROJECTS, "lz-ppm-forge"),
  },

  "cognirunner-global": {
    id: "cognirunner-global",
    product: "jira",
    app: "CogniRunner",
    appId: COGNI_APP,
    envId: COGNI_ENV,
    module: "cognirunner-global-page",
    moduleType: "jira:globalPage",
    surface: "custom",
    deepLink: (env) => deeplink.jiraGlobalPage(COGNI_APP, env),
    repo: path.join(PROJECTS, "CogniRunner"),
  },

  "sentinel-vault-realm": {
    id: "sentinel-vault-realm",
    product: "confluence",
    app: "Sentinel Vault",
    appId: SENTINEL_APP,
    envId: SENTINEL_ENV,
    module: "realm-console",
    moduleType: "confluence:spacePage",
    surface: "custom",
    deepLink: (env) => deeplink.confluenceSpacePage(SENTINEL_SPACE, SENTINEL_APP, env, SENTINEL_ROUTE),
    repo: path.join(PROJECTS, "Sentinel Vault"),
  },

  "altomata-hub": {
    id: "altomata-hub",
    product: "jira",
    app: "Altomata",
    appId: ALTOMATA_APP,
    envId: ALTOMATA_ENV,
    module: "altomata-hub",
    moduleType: "jira:globalPage",
    surface: "custom",
    deepLink: (env) => deeplink.jiraGlobalPage(ALTOMATA_APP, env),
    readySelector: ".hub-wrap",
    repo: path.join(PROJECTS, "Altomata"),
  },

  "license-leash-reactivation": {
    id: "license-leash-reactivation",
    product: "confluence",
    app: "License Leash",
    appId: LICENSELEASH_APP,
    envId: LICENSELEASH_ENV,
    module: "reactivation-page-confluence",
    moduleType: "confluence:globalPage",
    surface: "custom",
    deepLink: (env) => deeplink.confluenceGlobalPage(LICENSELEASH_APP, env, "reactivate-confluence-access"),
    repo: path.join(PROJECTS, "axpo-license-manager"),
  },

  "sentinel-steward-console": {
    id: "sentinel-steward-console",
    product: "confluence",
    app: "Sentinel Vault (admin)",
    appId: SENTINEL_APP,
    envId: SENTINEL_ENV,
    module: "steward-console",
    moduleType: "confluence:globalSettings",
    surface: "custom",
    deepLink: (env) => deeplink.confluenceGlobalSettings(SENTINEL_APP, env, "steward-console"),
    repo: path.join(PROJECTS, "Sentinel Vault"),
  },

  "license-leash-admin": {
    id: "license-leash-admin",
    product: "confluence",
    app: "License Leash (admin)",
    appId: LICENSELEASH_APP,
    envId: LICENSELEASH_ENV,
    module: "license-manager-admin",
    moduleType: "confluence:globalSettings",
    surface: "custom",
    deepLink: (env) => deeplink.confluenceGlobalSettings(LICENSELEASH_APP, env, "license-manager-admin"),
    repo: path.join(PROJECTS, "axpo-license-manager"),
  },
};

export function getTarget(id: string): Target {
  const t = TARGETS[id];
  if (!t) throw new Error(`Unknown target '${id}'. Known: ${Object.keys(TARGETS).join(", ")}`);
  return t;
}
