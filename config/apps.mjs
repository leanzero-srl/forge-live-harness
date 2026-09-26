// APP REGISTRY for the per-app runner (scripts/run-app.mjs) and the REST/hook probe layer (rest/).
//
// config/targets.ts says HOW to reach one UI module. This file says, per APP:
//   - which scenario directory is its suite and which specs are its read-only SMOKE set,
//   - its Forge environments and the env var that repoints its targets at one of them,
//   - which of those environments is INSTALLED on the test site (a render against an env that is
//     not installed fails for a reason that is not the app),
//   - its DOORS per environment — the browserless ways in: `hook` (the dev-only _testState web
//     trigger), `rest` (the app's own REST surface), `static` (Sentinel Vault's write-only static
//     trigger). A door that does not exist in an env is simply absent, and the runner falls back to
//     browser-only checks there — for a Runs on Atlassian app in production that is the design, not
//     a gap (webtriggers cost the badge; lz-ppm's deploy door strips them all).
//   - how parallel its suite may run: `suiteWorkers` 1 wherever specs mutate a shared bed.
//
// Facts dated 2026-09-26: env ids from `forge environments list`, installs from `forge install list`
// in each app repo. Re-derive with those two commands if a render suddenly lands on "app not found".
//
// Env-var convention for a non-development door URL/token: `<VAR>_<ENV>` e.g.
// `COGNI_RULES_API_URL_PRODUCTION`. Development uses the bare name the specs already use.

export const ENVS = ["development", "staging", "production"];
export const ENV_ALIASES = { dev: "development", development: "development", stg: "staging", staging: "staging", prod: "production", production: "production" };

export const APPS = {
  "lz-ppm": {
    title: "LeanZero Management (lz-ppm-forge)",
    aliases: ["lzppm", "leanzero-management", "lz"],
    scenarioDir: "scenarios/lz-ppm",
    smoke: ["scenarios/lz-ppm/dashboard.spec.ts"],
    envIdVar: "LZ_PPM_ENV_ID",
    envIds: {
      development: "d6096af9-3082-4ee1-a05e-f8b61d766b77",
      staging: "e2737456-93f7-42b7-81f4-1f2f9a8d93f7",
      production: "5c1c7532-62a8-4970-bd2c-11f909c06092",
    },
    installed: ["development"],
    badge: true, // Runs on Atlassian — production carries NO webtrigger (scripts/deploy-prod.mjs strips them)
    doors: {
      hook: { envs: ["development"], urlVar: "LZ_PPM_TESTHOOK_URL", secretVar: "HARNESS_SECRET" },
      // The REST API (`rest-api` webtrigger, lzm_ tokens) is reached by minting through the dev hook,
      // so it exists exactly where the hook exists.
      rest: { envs: ["development"], via: "hook-mint" },
    },
    blankOffDev: ["LZ_PPM_TESTHOOK_URL"],
    smokeWorkers: 1,
    suiteWorkers: 1, // LZPT/WFH bed specs mutate shared plans
  },

  cognirunner: {
    title: "CogniRunner",
    aliases: ["cogni", "cogni-runner"],
    scenarioDir: "scenarios/cognirunner",
    smoke: ["scenarios/cognirunner/global.spec.ts"],
    envIdVar: "COGNI_ENV_ID",
    envIds: {
      development: "989ecaa0-261b-406e-b444-78c01c0d7772",
      staging: "1abe9beb-537b-43c1-b94f-e877e251f779",
      production: "37dd35f1-42db-4e65-8e91-b2f18caed58d",
    },
    installed: ["development", "staging", "production"],
    badge: false, // AI egress; REST ships in every environment
    doors: {
      hook: { envs: ["development", "staging"], urlVar: "COGNI_TESTHOOK_URL", secretVar: "HARNESS_SECRET" },
      // Rules REST API in every env. Dev/staging: URL discovered + token minted via that env's hook.
      // Production has no hook, so it needs a token an admin minted in Settings → API access:
      // COGNI_RULES_API_URL_PRODUCTION + COGNI_RULES_API_TOKEN_PRODUCTION in .env.
      rest: { envs: ["development", "staging", "production"], urlVar: "COGNI_RULES_API_URL", tokenVar: "COGNI_RULES_API_TOKEN", via: "hook-mint-or-token" },
    },
    blankOffDev: ["COGNI_TESTHOOK_URL"],
    smokeWorkers: 1,
    suiteWorkers: 1, // HARNESS-BARRAGE-FIXTURE + the COGTEST workflow are shared
  },

  "sentinel-vault": {
    title: "Sentinel Vault",
    aliases: ["sentinel", "sv"],
    scenarioDir: "scenarios/sentinel-vault",
    smoke: ["scenarios/sentinel-vault/realm.spec.ts", "scenarios/sentinel-vault/admin-render.spec.ts"],
    envIdVar: "SENTINEL_ENV_ID",
    envIds: {
      development: "17516615-12ef-4790-8ce2-29151b7ee9ac",
      staging: "66f18786-ceb9-414f-8ced-a1efa02b76b7",
      production: "31eb89a3-9342-4489-b531-34ef0b19d722",
    },
    installed: ["development"],
    badge: true, // keeps the badge with a write-only STATIC trigger; reads go through Confluence properties
    doors: {
      hook: { envs: ["development"], urlVar: "SENTINEL_TESTHOOK_URL", secretVar: "HARNESS_SECRET" },
      static: { envs: ["development", "staging", "production"], urlVar: "SENTINEL_CONFIG_API_URL" },
    },
    blankOffDev: ["SENTINEL_TESTHOOK_URL", "SENTINEL_CONFIG_API_URL"],
    smokeWorkers: 2, // two independent read-only renders
    suiteWorkers: 1,
  },

  altomata: {
    title: "Altomata",
    aliases: [],
    scenarioDir: "scenarios/altomata",
    smoke: ["scenarios/altomata/render-smoke.spec.ts"],
    envIdVar: "ALTOMATA_ENV_ID",
    envIds: {
      development: "244ac2e9-6cbb-4012-99ae-1f958fc9309c",
      staging: "70672989-3796-42f9-bf43-3ac010cfe623",
      production: "918e3bff-fe04-479e-977f-c2674da1070b",
    },
    installed: ["development"],
    badge: false,
    doors: {
      hook: { envs: ["development"], urlVar: "ALTOMATA_TESTHOOK_URL", secretVar: "ALTOMATA_TRIGGER_SECRET" },
    },
    blankOffDev: ["ALTOMATA_TESTHOOK_URL"],
    smokeWorkers: 1,
    suiteWorkers: 1,
  },

  "license-leash": {
    title: "License Leash (axpo-license-manager)",
    aliases: ["licenseleash", "ll"],
    scenarioDir: "scenarios/license-leash",
    smoke: ["scenarios/license-leash/render-smoke.spec.ts", "scenarios/license-leash/admin-render.spec.ts"],
    envIdVar: "LICENSELEASH_ENV_ID",
    envIds: {
      development: "8910540b-8f3e-43e5-8e5b-7ee7bd9cdce4",
      staging: "962410cb-fcc4-4d41-a19d-fb3640ad385b",
      production: "83655f66-3b7d-44d9-b939-4f612b0c2b2b",
    },
    installed: ["development"],
    badge: false,
    doors: {
      hook: { envs: ["development"], urlVar: "LICENSELEASH_TESTHOOK_URL", secretVar: "LICENSELEASH_TESTHOOK_SECRET" },
    },
    blankOffDev: ["LICENSELEASH_TESTHOOK_URL", "LICENSELEASH_REACTIVATION_WEBTRIGGER"],
    smokeWorkers: 2,
    suiteWorkers: 1, // SQL state + dry-run audit rows are shared
  },

  chatwise: {
    title: "ChatWise",
    aliases: ["cw"],
    scenarioDir: "scenarios/chatwise",
    smoke: ["scenarios/chatwise/global-page-render.spec.ts"],
    envIdVar: "CHATWISE_ENV_ID",
    envIds: {
      development: "8613e672-d4ba-4afb-9bbe-d4b5a368a264",
      staging: "f7cce11f-14ee-4dcd-807d-27a67b7ff2dc",
      production: "86324d0e-9f79-4132-9a9a-670b281f0a98",
    },
    installed: ["development"],
    badge: false,
    doors: {}, // no REST surface and no test hook yet (baseline audit 2026-09-26: MISSING)
    blankOffDev: [],
    smokeWorkers: 1,
    suiteWorkers: 1, // conversations/personas are per-user state
  },

  kantega: {
    title: "Kantega User Management (third-party)",
    aliases: [],
    scenarioDir: "scenarios/kantega",
    smoke: ["scenarios/kantega/render-smoke.spec.ts"],
    envIdVar: "KANTEGA_ENV_ID",
    envIds: {}, // third-party: env id comes from .env (the install script writes it)
    installed: ["development"],
    badge: false,
    doors: {}, // not our app: UI + Jira/Confluence REST oracle only
    blankOffDev: [],
    smokeWorkers: 1,
    suiteWorkers: 1, // mutates real group memberships → serial, smurf-only
  },
};

export function resolveApp(name) {
  const n = String(name || "").toLowerCase();
  for (const [id, a] of Object.entries(APPS)) if (id === n || a.aliases.includes(n)) return { id, ...a };
  throw new Error(`Unknown app '${name}'. Known: ${Object.keys(APPS).join(", ")}`);
}

export function resolveEnv(name) {
  const e = ENV_ALIASES[String(name || "development").toLowerCase()];
  if (!e) throw new Error(`Unknown --env '${name}'. Use dev|staging|prod.`);
  return e;
}

/** Env-var name for a door value in an env: bare for development, `<VAR>_<ENV>` otherwise. */
export function envVarFor(base, env) {
  return env === "development" ? base : `${base}_${env.toUpperCase()}`;
}

/** The doors that EXIST for this app in this env (declared) — configuration is checked by the probe. */
export function doorsIn(app, env) {
  return Object.entries(app.doors || {}).filter(([, d]) => d.envs.includes(env)).map(([k]) => k);
}
