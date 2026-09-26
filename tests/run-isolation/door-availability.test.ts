// Offline proof of the door → env fallback (rest/probe.ts availability). No network.
//   npx tsx --test tests/run-isolation/door-availability.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { availability, type RestProbe } from "../../rest/probe";
import { probesFor } from "../../rest/probes/index";

const byDoor = (app: string, door: string) => probesFor(app).find((p: RestProbe) => p.door === door)!;

test("lz-ppm (Runs on Atlassian) has no hook/REST door in production: skipped, with the badge as the reason", () => {
  for (const door of ["hook", "rest"]) {
    const a = availability("lz-ppm", "production", byDoor("lz-ppm", door));
    assert.equal(a.run, false);
    assert.match(a.reason!, /Runs on Atlassian badge/);
  }
  assert.equal(availability("lz-ppm", "production", byDoor("lz-ppm", "site")).run, true); // the site is always there
});

test("a production door never borrows the development URL", () => {
  process.env.COGNI_RULES_API_URL = "https://dev.example/x1/abc"; // a dev value must not satisfy production
  delete process.env.COGNI_RULES_API_URL_PRODUCTION; delete process.env.COGNI_RULES_API_TOKEN_PRODUCTION;
  const a = availability("cognirunner", "production", byDoor("cognirunner", "rest"));
  assert.equal(a.run, false);
  assert.match(a.reason!, /COGNI_RULES_API_URL_PRODUCTION/);
  process.env.COGNI_RULES_API_URL_PRODUCTION = "https://prod.example/x1/abc";
  process.env.COGNI_RULES_API_TOKEN_PRODUCTION = "cgr_" + "0".repeat(48);
  assert.equal(availability("cognirunner", "production", byDoor("cognirunner", "rest")).run, true);
});

test("development doors run when the hook is configured, skip with the missing var when it is not", () => {
  process.env.LZ_PPM_TESTHOOK_URL = "https://hook.example/x1/abc"; process.env.HARNESS_SECRET = "s3cret-value";
  assert.equal(availability("lz-ppm", "development", byDoor("lz-ppm", "rest")).run, true);
  process.env.LZ_PPM_TESTHOOK_URL = "";
  const a = availability("lz-ppm", "development", byDoor("lz-ppm", "hook"));
  assert.equal(a.run, false);
  assert.match(a.reason!, /LZ_PPM_TESTHOOK_URL/);
});

test("an app with no door of its own still gets the site probe and nothing else", () => {
  assert.deepEqual(probesFor("chatwise").map((p) => p.door), ["site"]);
});
