// CogniRunner workflow-rule attach/detach via the Jira workflow REST API.
// Ported from CogniRunner/test-harness/lib/workflow.mjs (proven live shapes),
// using THIS harness's jira client. APP_ID/ENV_ID = the dev install on wolfaenpak.
import crypto from "node:crypto";
import { get, post } from "./jira.mjs";

export const APP_ID = "36415848-6868-4697-9554-3c3ad87b8da9";
export const ENV_ID = "989ecaa0-261b-406e-b444-78c01c0d7772"; // development
export const WORKFLOW_CONFIG_MAX_BYTES = 32768;

export const MODULE = {
  validator: "ai-text-field-validator",
  condition: "ai-text-field-condition",
  static: "ai-static-post-function",
  semantic: "ai-semantic-post-function",
};
export const RULE_KEY = {
  validator: "forge:expression-validator",
  condition: "forge:expression-condition",
  static: "forge:workflow-post-function",
  semantic: "forge:workflow-post-function",
};
const ari = (moduleKey) => `ari:cloud:ecosystem::extension/${APP_ID}/${ENV_ID}/static/${moduleKey}`;

export function buildRule(type, configObj) {
  const moduleKey = MODULE[type];
  const ruleKey = RULE_KEY[type];
  if (!moduleKey || !ruleKey) throw new Error(`unknown rule type: ${type}`);
  const configStr = typeof configObj === "string" ? configObj : JSON.stringify(configObj);
  const bytes = Buffer.byteLength(configStr, "utf8");
  if (bytes > WORKFLOW_CONFIG_MAX_BYTES) throw new Error(`config too large: ${bytes} bytes`);
  return {
    ruleKey,
    parameters: { key: ari(moduleKey), config: configStr, id: crypto.randomUUID(), disabled: "false" },
    id: crypto.randomUUID(),
  };
}

export function attachRuleToTransition(transition, type, rule) {
  if (type === "validator") {
    (transition.validators ||= []).push(rule);
  } else if (type === "condition") {
    let tree = transition.conditions;
    if (!tree || Array.isArray(tree)) {
      tree = { operation: "ALL", conditions: Array.isArray(tree) ? tree : [], conditionGroups: [] };
      transition.conditions = tree;
    }
    if (!tree.operation) tree.operation = "ALL";
    (tree.conditions ||= []).push(rule);
  } else {
    (transition.actions ||= []).push(rule);
  }
}

export function makeSelfLoop(hubStatusRef, name, idNum) {
  return {
    id: String(idNum),
    type: "DIRECTED",
    toStatusReference: String(hubStatusRef),
    links: [{ fromStatusReference: String(hubStatusRef), fromPort: 0, toPort: 1 }],
    name, description: "", actions: [], validators: [], triggers: [], properties: {},
  };
}

export async function readWorkflow(name) {
  const d = await get(`/rest/api/3/workflows/search?queryString=${encodeURIComponent(name)}&expand=values.transitions`);
  const wf = (d.values || []).find((w) => w.name === name);
  if (!wf) throw new Error(`workflow not found: ${name}`);
  if (!wf.version?.id || wf.version?.versionNumber === undefined) throw new Error(`workflow ${name} has no version info`);
  return { top: d, wf };
}

function buildUpdatePayload(top, wf) {
  const fullStatuses = (top.statuses || []).map((s) => {
    const o = { statusReference: s.statusReference };
    if (s.id !== undefined) o.id = s.id;
    if (s.name !== undefined) o.name = s.name;
    if (s.statusCategory !== undefined) o.statusCategory = s.statusCategory;
    return o;
  });
  return {
    statuses: fullStatuses,
    workflows: [{
      id: wf.id,
      version: { id: wf.version.id, versionNumber: wf.version.versionNumber },
      statuses: (wf.statuses || []).map((s) => ({ statusReference: s.statusReference })),
      transitions: wf.transitions,
    }],
  };
}

export async function updateWorkflow(top, wf) {
  const res = await post("/rest/api/3/workflows/update", buildUpdatePayload(top, wf), { raw: true });
  if (res.status >= 400) throw new Error(`workflows/update failed ${res.status}: ${res.text.slice(0, 1000)}`);
  return res.status;
}

/** Attach a batch of self-loop rules; returns [{name,type,transitionId,ruleId}]. */
export async function attachSelfLoopRules(workflowName, hubStatusRef, specs, startId = 9001) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { top, wf } = await readWorkflow(workflowName);
    const existingIds = new Set((wf.transitions || []).map((t) => String(t.id)));
    let idNum = startId;
    const result = [];
    for (const spec of specs) {
      while (existingIds.has(String(idNum))) idNum++;
      existingIds.add(String(idNum));
      const t = makeSelfLoop(hubStatusRef, spec.name, idNum);
      const rule = buildRule(spec.type, spec.config);
      attachRuleToTransition(t, spec.type, rule);
      wf.transitions.push(t);
      result.push({ name: spec.name, type: spec.type, transitionId: String(idNum), ruleId: rule.parameters.id });
      idNum++;
    }
    try { await updateWorkflow(top, wf); return result; }
    catch (e) { if (attempt < 2 && /409|version/i.test(e.message)) continue; throw e; }
  }
  throw new Error("attachSelfLoopRules: exhausted retries");
}

/** Remove transitions by name PREFIX (cleanup). One version-conflict retry. */
export async function detachByNamePrefix(workflowName, prefix) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { top, wf } = await readWorkflow(workflowName);
    const before = wf.transitions.length;
    wf.transitions = wf.transitions.filter((t) => !(t.name || "").startsWith(prefix));
    if (wf.transitions.length === before) return 0; // nothing to remove
    try { await updateWorkflow(top, wf); return before - wf.transitions.length; }
    catch (e) { if (attempt < 2 && /409|version/i.test(e.message)) continue; throw e; }
  }
  throw new Error("detachByNamePrefix: exhausted retries");
}
