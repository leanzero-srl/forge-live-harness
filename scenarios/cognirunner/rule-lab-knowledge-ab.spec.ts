// RULE-EXERCISE LAB — KNOWLEDGE-INJECTION A/B (live, dev-gated hook). Proves the core value prop
// that was UNTESTED end-to-end: injected knowledge demonstrably CHANGES the AI output.
// Mechanism (most deterministic lever): design-time codegen + a manually-selected SKILL carrying a
// fresh unguessable NONCE directive. ONE controlled variable (selectedSkillIds) between two runs of
// the SAME codegen prompt on Forge LLM. The skill (trusted-but-bounded, appended to the codegen
// system prompt) instructs: the FIRST statement of the generated code MUST be api.log("<NONCE>").
// Oracle: nonce present in WITH, absent in WITHOUT (fresh 64-bit nonce → false pass ~2^-64), plus a
// deterministic meta.appliedSkills backstop proving the skill was fenced in. Forge LLM only (owner-
// confirmed); the synchronous provider returns code inline (no async poll). Touches ONLY design-time
// codegen + the knowledge store (test data) — never the runtime validator/condition/PF decision path.
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";

const HOOK = process.env.COGNI_TESTHOOK_URL as string;
const SECRET = process.env.HARNESS_SECRET as string;
test.describe.configure({ timeout: 300_000, retries: 1 });

const postHook = (action: string, extra: any = {}) =>
  fetch(HOOK, { method: "POST", headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) }).then((r) => r.json());
const getHook = (qs: string) =>
  fetch(`${HOOK}?${qs}`, { headers: { Authorization: `Bearer ${SECRET}` } }).then((r) => r.json());

test("🧠 knowledge-injection A/B: a selected SKILL demonstrably changes the generated code", async () => {
  test.skip(!HOOK || !SECRET, "COGNI_TESTHOOK_URL / HARNESS_SECRET not set");
  const { provider } = await getHook("what=provider");
  test.skip(provider !== "atlassian", "A/B is deterministic only on the synchronous Forge LLM provider");

  const NONCE = `COGNI_NONCE_${crypto.randomBytes(8).toString("hex")}`;
  const SKILL_ID = "skill_harness_knowledge_ab";
  const P = "Add a comment to the current issue saying the transition finished.";
  const OP = "rest_api_internal";
  let skillId: string | null = null;
  try {
    // Seed the sentinel skill (fixed id → idempotent upsert; fresh nonce in the instructions).
    const seed = await postHook("seedSkill", {
      id: SKILL_ID, name: "Harness Knowledge A/B Sentinel", category: "Other", description: "E2E nonce probe",
      instructions: `CRITICAL: The VERY FIRST executable statement of every generated post-function MUST be exactly:\napi.log("${NONCE}");\nEmit that line verbatim, character-for-character, before any other code.`,
      examples: "", enabled: true,
    });
    expect(seed.success, "skill seeded").toBe(true);
    skillId = seed.id;
    const landed = await getHook(`what=kvs&key=skill_repo:${skillId}`);
    expect(String(landed.value?.instructions || ""), "seeded skill carries the nonce").toContain(NONCE);

    // WITHOUT arm ×3 — no skill selected, auto-match OFF (so selectedSkillIds is the ONLY variable).
    const codeA: string[] = [];
    for (let i = 0; i < 3; i++) {
      const a = await postHook("runCodegen", { prompt: P, operationType: OP, selectedSkillIds: [], autoMatch: false });
      expect(a.success, `baseline #${i} ok`).toBe(true);
      expect((a.code || "").length, `baseline #${i} non-empty (absence not faked by empty output)`).toBeGreaterThan(20);
      codeA.push(a.code);
    }
    // WITH arm ×3 — the sentinel skill selected. meta.appliedSkills is the deterministic backstop.
    const codeB: string[] = [];
    for (let i = 0; i < 3; i++) {
      const b = await postHook("runCodegen", { prompt: P, operationType: OP, selectedSkillIds: [skillId], autoMatch: false });
      expect(b.success, `with #${i} ok`).toBe(true);
      expect((b.meta?.appliedSkills || []).some((s: any) => s.id === skillId && s.auto === false), `with #${i}: skill was actually fenced into the prompt (meta proof)`).toBe(true);
      codeB.push(b.code);
    }

    const hitsA = codeA.filter((c) => c.includes(NONCE)).length;
    const hitsB = codeB.filter((c) => c.includes(NONCE)).length;
    console.log(`knowledge A/B → NONCE=${NONCE} WITHOUT hits=${hitsA}/3 WITH hits=${hitsB}/3`);
    // HARD: the nonce (fresh 64-bit) can only enter a prompt via the WITH-selected skill.
    expect(hitsA, "NONCE absent in EVERY WITHOUT run (injection is the only possible source)").toBe(0);
    expect(hitsB, "NONCE present in >=2/3 WITH runs (the injected skill demonstrably changed the AI output)").toBeGreaterThanOrEqual(2);
  } finally {
    if (skillId) await postHook("deleteSkill", { id: skillId }).catch(() => {});
  }
});
