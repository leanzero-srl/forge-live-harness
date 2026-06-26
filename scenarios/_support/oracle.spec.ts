// Isolation check: the lz-ppm oracle imports + computes under Playwright/esbuild.
import { test, expect } from "@playwright/test";
// @ts-ignore - JS oracle resolved by esbuild
import { FIXTURES, expectedForFixture } from "../../expected/lz-ppm-cascade.ts";

test("oracle: simple chain matches lz-ppm snapshot", () => {
  const fx = FIXTURES.find((f: any) => f.name === "simple chain A->B, push A due");
  const got = expectedForFixture(fx);
  expect(got.A).toEqual({ startDate: "2026-06-01", dueDate: "2026-06-10", duration: 8, buffer: "No" });
  expect(got.B).toEqual({ startDate: "2026-06-11", dueDate: "2026-06-12", duration: 2, buffer: "No" });
});
