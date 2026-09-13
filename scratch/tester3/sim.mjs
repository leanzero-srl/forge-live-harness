import { renderDeckFor, layoutHelp, templateIds, RenderError, MAX_SLIDES, DECK_TEMPLATES } from "/Users/mihaiperdum/Projects/ChatWise/src/shared/documents/pptx/index.js";

const vocab = (id) => ({ layouts: Object.keys(DECK_TEMPLATES[id||"diconium-brand"].manifest.layouts), slots: layoutHelp(id), templates: templateIds() });

console.log("=== layoutHelp (what rides in the RESULT) ===");
console.log(layoutHelp("diconium-brand"));
console.log("layoutHelp chars:", layoutHelp("diconium-brand").length);

// A plausible FIRST GUESS with flat / invented names
const guess = [
  { layout: "cover", values: { title: ["Tester", "sub"], blurb: "x", tagline: "y", meta: "z" } },
  { layout: "cards", values: { title: "t", card1_head: "a", card1_body: "b", card2_head: "c", card2_body: "d", card3_head: "e", card3_body: "f" } },
  { layout: "stats", values: { title: "t", stat1: "40%", stat1label: "x", stat2: "2400", stat2label: "y" } },
  { layout: "timeline", values: { title: "t", phase1: "q1", phase1desc: "a", phase2: "q2", phase2desc: "b" } },
];
try {
  await renderDeckFor("diconium-brand", { title: "T", slides: guess });
  console.log("guess RENDERED (no refusal)");
} catch (e) {
  const result = { success: false, error: e.message, tool: "createPresentation", ...vocab(), ...e.detail };
  const s = JSON.stringify(result);
  console.log("=== REFUSAL RESULT (verbatim, from the shipped renderer) ===");
  console.log(e.message);
  console.log("--- full JSON result length:", s.length, "chars");
}

// a VALID spec -> the success result
const good = [
  { layout: "cover", values: { title: ["Tester Baseline Probe", "warehouse automation rollout"], blurb: "b", tagline: "Updating industries", meta: "diconium 2025" } },
  { layout: "cards", values: { title: "t", "card1.head": "a", "card1.body": "b", "card2.head": "c", "card2.body": "d", "card3.head": "e", "card3.body": "f", footnote: "n" } },
  { layout: "stats", values: { title: "t", "stat1.value": "40%", "stat1.label": "x", "stat2.value": "2,400", "stat2.label": "y", "stat3.value": "18", "stat3.label": "z" } },
  { layout: "timeline", values: { title: "t", "phase1.head": "q1", "phase1.body": "a", "phase2.head": "q2", "phase2.body": "b", "phase3.head": "q3", "phase3.body": "c" } },
];
const r = await renderDeckFor("diconium-brand", { title: "T", slides: good });
const success = { success: true, deck: { filename: "tester-baseline-probe.pptx", slides: r.slides, sizeBytes: r.buffer.length, handle: "722426e20b704fc2a5a3b983e624e42a", heldForMinutes: 30 }, maxSlides: MAX_SLIDES, delivery: { attached: false, why: "No issue was named, so there is nowhere in Jira to put the file.", fix: "Tell the user the deck is ready and offer it. If they name an issue — now or on a later turn — call attachPresentation with just that issueKey. It does not rebuild the deck." } };
console.log("=== SUCCESS RESULT length:", JSON.stringify(success).length, "chars; bytes:", r.buffer.length, "slides:", r.slides);
