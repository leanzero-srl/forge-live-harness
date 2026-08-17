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

  writeFileSync(
    join(OUT, "webpack.config.cjs"),
    `const path = require("path");
module.exports = {
  mode: "development",
  devtool: false,
  entry: ${JSON.stringify(join(APP_ROOT, "src/chat/shared/components/ChatInterface.js"))},
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

    const file = join(OUT, `${surface}.html`);
    writeFileSync(
      file,
      `<!doctype html><html data-color-mode="light"><head><meta charset="utf-8">${style}</head>
<body class="${surface === "issuePanel" ? "issue-panel" : ""}">
<div class="chat-container">
  <div class="chat-header"></div>
  <div class="chat-messages" id="chatMessages"></div>
  <div class="chat-input-container">
    <textarea id="chatInput"></textarea><button id="sendButton"></button>
  </div>
</div>
<script>${bundle}</script></body></html>`,
    );
    pages[surface] = `file://${file}`;
  }
  return pages;
}
