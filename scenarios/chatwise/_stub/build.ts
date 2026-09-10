// Builds the STUB SURFACE HARNESS for ChatWise's two chat surfaces.
//
// WHY THIS EXISTS
// ---------------
// The established loop for this frontend — serve `src/` with a static server
// and drive it with Playwright — stopped working. `enforceBetaGate()` appends
// a full-page cover SYNCHRONOUSLY before its first await and then fails CLOSED
// when `invoke("getAccessStatus")` throws, which it always does with no Forge
// bridge. The page stays covered and nothing initialises.
//
// So instead of loading the shipped page, this mounts the REAL component into
// a copy of each surface's markup with that surface's own <style> block
// inlined verbatim. The CSS under test is therefore the shipped CSS, and
// @forge/bridge is aliased to a stub so nothing reaches for a resolver.
//
// Deliberately per-surface: the two surfaces share no design tokens, so their
// CSS is duplicated in the app and has to be verified twice or half of it is
// unverified.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = process.env.CHATWISE_ROOT || join(process.env.HOME!, "Projects/ChatWise");
export const OUT = join(HERE, ".out");
export type Surface = "globalPage" | "issuePanel";

/** Bundle ChatInterface once, then write one page per surface. */
export function buildStub(): Record<Surface, string> {
  mkdirSync(OUT, { recursive: true });

  writeFileSync(
    join(OUT, "bridge-stub.js"),
    `export const invoke = async () => ({});
export const view = { getContext: async () => ({}) };
export const router = { open: () => {} };
`,
  );

  // One entry per class under test. The stub exposes all three because the
  // upload path spans them: the drop zone hands files to the controller, and
  // both surfaces instantiate the same pair.
  //
  // PersonaSelector and the availability contract come too: the picker is a
  // SHARED component painted by two stylesheets that share no tokens, so its
  // disabled row has to be looked at on both surfaces or half of it is
  // unverified.
  writeFileSync(
    join(OUT, "entry.js"),
    `export { ChatInterface } from ${JSON.stringify(join(APP_ROOT, "src/chat/shared/components/ChatInterface.js"))};
export { JobMonitoringHandler } from ${JSON.stringify(join(APP_ROOT, "src/chat/shared/services/JobMonitoringHandler.js"))};
export { AttachmentController } from ${JSON.stringify(join(APP_ROOT, "src/chat/shared/services/AttachmentController.js"))};
export { DropZone } from ${JSON.stringify(join(APP_ROOT, "src/chat/shared/services/DropZone.js"))};
export { PersonaSelector } from ${JSON.stringify(join(APP_ROOT, "src/chat/shared/components/PersonaSelector.js"))};
export * as Constants from ${JSON.stringify(join(APP_ROOT, "src/chat/shared/constants/Constants.js"))};
`,
  );

  writeFileSync(
    join(OUT, "webpack.config.cjs"),
    `const path = require("path");
module.exports = {
  mode: "development",
  devtool: false,
  entry: path.resolve(__dirname, "entry.js"),
  output: {
    path: __dirname,
    filename: "bundle.js",
    // Without this webpack emits an automatic-publicPath probe that throws
    // "Automatic publicPath is not supported in this browser" under file://,
    // and the library global is never assigned.
    publicPath: "",
    library: { name: "CW", type: "var" },
  },
  resolve: { alias: { "@forge/bridge": path.resolve(__dirname, "bridge-stub.js") } },
};
`,
  );

  execFileSync("npx", ["webpack", "--config", join(OUT, "webpack.config.cjs")], {
    cwd: APP_ROOT,
    stdio: "pipe",
  });

  const bundle = readFileSync(join(OUT, "bundle.js"), "utf8");
  const pages = {} as Record<Surface, string>;

  for (const surface of ["globalPage", "issuePanel"] as Surface[]) {
    const html = readFileSync(join(APP_ROOT, `src/chat/${surface}/index.html`), "utf8");
    const start = html.indexOf("<style>");
    const end = html.lastIndexOf("</style>") + "</style>".length;
    if (start < 0 || end < start) throw new Error(`no <style> block in ${surface}/index.html`);
    const style = html.slice(start, end);

    // The composer is taken VERBATIM from the surface, not hand-written. Its
    // element ids are the contract AttachmentController and DropZone are
    // parameterised by, so a paraphrase would test a composer that does not
    // ship.
    const composer = sliceElement(html, '<div class="chat-input-container">');
    // Same rule as the composer: taken VERBATIM. The element ids
    // (personaDropdown / dropdownSelected / dropdownOptions) are the contract
    // PersonaSelector looks itself up by, and it THROWS if any is missing — so a
    // paraphrase here would test a picker that does not ship.
    const persona = sliceElement(html, '<div class="persona-selector-container">');

    const thinking = sliceElement(html, '<div class="thinking-indicator"');

    const file = join(OUT, `${surface}.html`);
    writeFileSync(
      file,
      `<!doctype html><html data-color-mode="light"><head><meta charset="utf-8">${style}</head>
<body class="${surface === "issuePanel" ? "issue-panel" : ""}">
<div class="chat-container">
  <div class="chat-header"></div>
  <div class="stub-persona-bay" style="display:flex;padding:12px;">${persona}</div>
  <div class="chat-messages" id="chatMessages"></div>
  ${thinking}
  ${composer}
</div>
<script>${bundle}</script></body></html>`,
    );
    pages[surface] = `file://${file}`;
  }
  return pages;
}

/**
 * The same built page, born in DARK mode.
 *
 * Deliberately a SEPARATE FILE rather than flipping `data-color-mode` after
 * load. Several rules on both surfaces carry `transition: all 160ms/0.2s`, so a
 * theme flipped at runtime is genuinely mid-transition for a sixth of a second
 * and a screenshot or a getComputedStyle taken inside that window reads the
 * OLD theme's colour — which looks exactly like a dark-mode bug and cost an
 * hour of chasing one that did not exist. A page that was never light has no
 * transition to be caught in.
 */
export function darkVariant(url: string): string {
  const file = url.replace(/^file:\/\//, "");
  const dark = file.replace(/\.html$/, "-dark.html");
  writeFileSync(
    dark,
    readFileSync(file, "utf8").replace(
      'data-color-mode="light"',
      'data-color-mode="dark"',
    ),
  );
  return `file://${dark}`;
}

/**
 * Slice one element out of an HTML file by balancing <div> against </div>.
 *
 * A regex cannot do this — the composer nests six levels deep — and taking
 * "up to the next </div>" would truncate it mid-way, which shows up as a
 * missing element id rather than as a parse error.
 */
function sliceElement(html: string, openTag: string): string {
  const start = html.indexOf(openTag);
  if (start < 0) throw new Error(`not found: ${openTag}`);
  let depth = 0;
  const re = /<div\b[^>]*>|<\/div>/g;
  re.lastIndex = start;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    depth += m[0] === "</div>" ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  throw new Error(`unbalanced element: ${openTag}`);
}
