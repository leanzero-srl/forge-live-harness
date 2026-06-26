// Autonomous adapter: sends the evidence bundle (focus screenshots + verbatim
// console/network slices + the failed expectations) to the Claude Messages API and
// writes the SAME fix-report.json. Structured output is forced via tool_choice (a
// tool whose input_schema IS the FixReport schema) — the most SDK-compatible path —
// then ajv-validated with one retry. Output stays byte-compatible with the
// Claude-Code-in-loop path.
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import Ajv from "ajv";
import {
  buildBriefing,
  evidenceSlices,
  focusScreenshots,
  readManifest,
  readJson,
  FIX_REPORT_SCHEMA_PATH,
  REPO_ROOT,
  type Manifest,
} from "./shared";
import { assessConfig } from "./config";

const fixReportSchema = readJson<Record<string, unknown>>(FIX_REPORT_SCHEMA_PATH)!;
const ajv = new Ajv({ allErrors: true, strict: false });
const validateReport = ajv.compile(fixReportSchema);

type Block = Anthropic.Messages.ContentBlockParam;

function imageBlocks(bundleDir: string, rels: string[]): Block[] {
  const out: Block[] = [];
  for (const rel of rels) {
    const p = path.join(bundleDir, rel);
    if (!fs.existsSync(p)) continue;
    out.push({ type: "text", text: `Image: ${rel}` });
    out.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: fs.readFileSync(p).toString("base64") },
    });
  }
  return out;
}

async function callForReport(client: Anthropic, system: string, content: Block[]): Promise<any> {
  const res = await client.messages.create({
    model: assessConfig.model,
    max_tokens: assessConfig.maxTokens,
    system,
    tools: [
      {
        name: "emit_fix_report",
        description: "Emit the structured FixReport for this failed run.",
        input_schema: fixReportSchema as Anthropic.Messages.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "emit_fix_report" },
    messages: [{ role: "user", content }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Model did not return a tool_use block.");
  return block.input;
}

function stamp(report: any, m: Manifest): void {
  report.schemaVersion = "1.0";
  report.runId = m.runId;
  report.scenarioId = m.scenarioId;
  report.producer = "api-adapter";
  report.model = assessConfig.model;
  report.generatedAt = new Date().toISOString();
}

export async function assessWithApi(bundleDir: string): Promise<boolean> {
  const m = readManifest(bundleDir);
  if (!m || m.captureStatus === "pass") return false;
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("  (skip --api: ANTHROPIC_API_KEY not set)");
    return false;
  }

  const slices = evidenceSlices(bundleDir);
  const briefing = buildBriefing(m, slices);
  const images = focusScreenshots(m, assessConfig.maxKeyframes);
  const system = fs.existsSync(path.join(REPO_ROOT, "AGENTS.md"))
    ? fs.readFileSync(path.join(REPO_ROOT, "AGENTS.md"), "utf8")
    : "You assess live Forge UI test failures and emit a FixReport. Cite evidence for every claim.";

  const content: Block[] = [
    { type: "text", text: `Assess this failed live-Forge-UI run and emit a FixReport.\n\n${briefing}` },
    ...imageBlocks(bundleDir, images),
    {
      type: "text",
      text:
        "Emit a FixReport via the emit_fix_report tool. Every finding needs >=1 evidence ref " +
        "(screenshot path, console.json#N, network.json#N, or aria.yaml#L..). Mark any hypothesis " +
        "you cannot confirm from the evidence as lowConfidence=true (confidence < 0.5). Localize the " +
        "issue (surface + selector + ariaName). Suggested fixes name a real file in the app repo.",
    },
  ];

  const client = new Anthropic();
  let report = await callForReport(client, system, content);
  stamp(report, m);

  if (!validateReport(report)) {
    const errs = JSON.stringify(validateReport.errors);
    content.push({ type: "text", text: `Your previous FixReport failed schema validation: ${errs}. Re-emit a valid one.` });
    report = await callForReport(client, system, content);
    stamp(report, m);
    if (!validateReport(report)) {
      fs.writeFileSync(path.join(bundleDir, "fix-report.invalid.json"), JSON.stringify(report, null, 2));
      throw new Error("API adapter produced an invalid FixReport twice; wrote fix-report.invalid.json for inspection.");
    }
  }

  fs.writeFileSync(path.join(bundleDir, "fix-report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(bundleDir, "fix-brief.md"), renderBrief(report));
  return true;
}

export function renderBrief(report: any): string {
  const out: string[] = [];
  out.push(`# Fix brief — ${report.scenarioId} (${report.runId})`);
  out.push(`**Verdict:** ${report.verdict} · **Producer:** ${report.producer}${report.model ? ` (${report.model})` : ""}`);
  out.push("");
  for (const f of report.findings ?? []) {
    out.push(`## ${f.id} · severity: ${f.severity}`);
    out.push(`**Expected:** ${f.expected}`);
    out.push(`**Observed:** ${f.observed}`);
    out.push(`**Where:** \`${f.localization?.selector ?? ""}\` (${f.localization?.ariaName ?? ""}) in ${f.localization?.surface ?? ""}`);
    const rc = f.rootCause ?? {};
    out.push(`**Root cause (confidence ${rc.confidence}${rc.lowConfidence ? " ⚠ low-confidence" : ""}):** ${rc.hypothesis}`);
    out.push("");
    out.push("**Evidence**");
    for (const e of f.evidence ?? []) out.push(`- ${e.kind}: \`${e.ref}\`${e.quote ? ` — ${e.quote}` : ""}`);
    out.push("");
    out.push("**Suggested fix**");
    for (const s of f.suggestedFix ?? []) out.push(`- \`${s.repo}/${s.filePathHint}\`${s.symbolHint ? ` (${s.symbolHint})` : ""}: ${s.change}`);
    out.push("");
    if (f.repro?.length) {
      out.push("**Repro**");
      f.repro.forEach((r: string, i: number) => out.push(`${i + 1}. ${r}`));
      out.push("");
    }
  }
  return out.join("\n");
}
