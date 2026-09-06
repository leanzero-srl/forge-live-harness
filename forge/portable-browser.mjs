import {closePhase} from './close-diagnostics.mjs';
import {beginObservation} from './browser-process-observation.cjs';
// Explicit portable-session adapter. The shared persistent profile is never opened or changed.
import fs from 'node:fs';
import {installPortableViewportSizing} from './portable-viewport.mjs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const MODE = 'portable-chrome152';
export const VERSION = '152.0.7977.76';
export const EXECUTABLE_SHA256 = '755178ee89130a6f1c94cc4ecb2289fe74240db3e7efe9ec69a6cfcd4b93a6ee';
export const FRAMEWORK_SHA256 = 'bfea9981cc61dfa72d847c920f274e4e96e362954f451198d8ee1650cbefb2e6';
const receipts = new WeakMap();
export const getPortableReceipt = context => receipts.get(context) ?? null;
const bundle = '/Applications/Google Chrome.app';
export const EXECUTABLE = path.join(bundle, 'Contents/MacOS/Google Chrome');
export const FRAMEWORK = path.join(bundle, `Contents/Frameworks/Google Chrome Framework.framework/Versions/${VERSION}/Google Chrome Framework`);
export const STORAGE_STATE = path.join(os.homedir(), 'Projects/forge-live-harness/.auth/storage-state.json');
export const APP_URL = 'https://wolfaenpak.atlassian.net/jira/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/d6096af9-3082-4ee1-a05e-f8b61d766b77';
export class PortableBrowserError extends Error {
  constructor(code) { super(code); this.name = 'PortableBrowserError'; this.code = code; }
}
const refuse = code => { throw new PortableBrowserError(code); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function readRegular(file, maxBytes) {
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.size > maxBytes || before.size === 0) refuse('PORTABLE_FILE_INVALID');
    const bytes = fs.readFileSync(fd), after = fs.fstatSync(fd);
    if (before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== after.size) refuse('PORTABLE_FILE_CHANGED');
    return bytes;
  } catch (error) {
    if (error instanceof PortableBrowserError) throw error;
    refuse('PORTABLE_FILE_UNAVAILABLE'); // Never print file contents or JSON parse fragments.
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
export function verifyPortableBinary() {
  if (sha(readRegular(EXECUTABLE, 100 * 1024 * 1024)) !== EXECUTABLE_SHA256 ||
      sha(readRegular(FRAMEWORK, 1024 * 1024 * 1024)) !== FRAMEWORK_SHA256) refuse('PORTABLE_BINARY_MISMATCH');
}
export function readPortableAdmission() {
  verifyPortableBinary();
  return parsePortableState(readRegular(STORAGE_STATE, 16 * 1024 * 1024));
}
export function parsePortableState(bytes) {
  let state;
  try { state = JSON.parse(bytes.toString()); } catch { refuse('PORTABLE_STATE_INVALID'); }
  if (!state || !Array.isArray(state.cookies) || !Array.isArray(state.origins)) refuse('PORTABLE_STATE_INVALID');
  return state;
}
function assertNotLogin(page) {
  for (const frame of page.frames()) {
    const url = new URL(frame.url());
    if (url.hostname === 'id.atlassian.com' || /\/(login|mfa|verify|challenge)(\/|$)/i.test(url.pathname)) refuse('PORTABLE_AUTH_INTERACTION_REQUIRED');
  }
}
/** Actual current principal and deployed app stamp; no credentials or login interaction. */
export async function verifyPortableIdentity(context, expected) {
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  await page.goto('https://wolfaenpak.atlassian.net/jira/your-work', {waitUntil:'domcontentloaded',timeout:45000});
  assertNotLogin(page);
  const response = await context.request.get('https://wolfaenpak.atlassian.net/rest/api/3/myself', {maxRedirects:0,timeout:20000});
  if (response.status() !== 200) refuse('PORTABLE_PRINCIPAL_UNAVAILABLE');
  let principal;
  try { principal = await response.json(); } catch { refuse('PORTABLE_PRINCIPAL_UNAVAILABLE'); }
  if (principal.accountId !== expected.accountId || principal.active !== true) refuse('PORTABLE_PRINCIPAL_MISMATCH');
  await page.goto(APP_URL, {waitUntil:'domcontentloaded',timeout:45000});
  assertNotLogin(page);
  if (page.url().split('?')[0].replace(/\/$/, '') !== APP_URL) refuse('PORTABLE_APP_ROUTE_MISMATCH');
  const element = page.locator('iframe[data-testid="hosted-resources-iframe"]').first();
  await element.waitFor({state:'attached',timeout:45000});
  const handle = await element.elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) refuse('PORTABLE_APP_UNAVAILABLE');
  await frame.getByRole('heading',{name:'Plans',exact:true}).waitFor({state:'visible',timeout:45000});
  const body = await frame.locator('body').innerText();
  if (body.match(/REV\s+V(\d+\.\d+\.\d+)/i)?.[1] !== expected.uiVersion) refuse('PORTABLE_APP_VERSION_MISMATCH');
  assertNotLogin(page);
  // Heading/body reads yield: recheck the exact route at final admission too.
  if (page.url().split('?')[0].replace(/\/$/, '') !== APP_URL) refuse('PORTABLE_APP_ROUTE_MISMATCH');
  await page.close();
}
function aggregate(errors, message) {
  if (errors.length === 1) throw errors[0];
  if (errors.length) throw new AggregateError(errors,message);
}
/** Dependency seam is for source-bound tests. Production supplies only chromium and the existing suppressor. */
export function createPortableLauncher({chromium, installHostFlagSuppressor, readAdmission=readPortableAdmission, verifyIdentity=verifyPortableIdentity}) {
  return async function launchPortableContext(options) {
    if (options?.mode !== MODE) refuse('PORTABLE_OPT_IN_REQUIRED');
    if (options.authFlow === true) refuse('PORTABLE_AUTH_FLOW_FORBIDDEN');
    if (typeof options.expected?.accountId !== 'string' || !options.expected.accountId.trim() || !/^\d+\.\d+\.\d+$/.test(options.expected?.uiVersion || '')) refuse('PORTABLE_IDENTITY_REQUIRED');
    if (!options.viewport || !Number.isSafeInteger(options.viewport.width) || options.viewport.width < 1 || !Number.isSafeInteger(options.viewport.height) || options.viewport.height < 1) refuse('PORTABLE_VIEWPORT_REQUIRED');
    if (typeof installHostFlagSuppressor !== 'function') refuse('PORTABLE_HOST_SUPPRESSOR_REQUIRED');
    const state = readAdmission(); // Read once, in memory. Never pass the live file path to a mutable consumer.
    const processObservation = beginObservation(EXECUTABLE);
    let browser, context, closing;
    let intentional = false;
    const unexpected = [];
    let originalClose;
    const close = (closeOptions) => {
      if (!closing) {
        intentional = true;
        closing = (async () => {
          const errors = [...unexpected];
          if (originalClose) try { await closePhase(options.observeClose, 'portable-context-close', () => originalClose(closeOptions)); } catch (error) { errors.push(error); }
          if (browser) try {
            processObservation?.closing(browser,'browser-close-start');
            await closePhase(options.observeClose, 'browser-close', () => browser.close());
            processObservation?.closing(browser,'browser-close-complete');
          } catch (error) { processObservation?.closing(browser,'browser-close-failed'); errors.push(error); }
          if (processObservation) try { processObservation.check(); } catch (error) { errors.push(error); }
          aggregate(errors,'Portable context and owned browser cleanup failed; all causes retained');
        })();
      }
      return closing;
    };
    try {
      browser = await chromium.launch({executablePath:EXECUTABLE,headless:options.headed !== true,args:['--no-first-run','--no-default-browser-check'],...(processObservation?{logger:processObservation.logger}:{})});
      processObservation?.attach(browser);
      browser.once('disconnected', () => { if (!intentional) unexpected.push(new PortableBrowserError('PORTABLE_BROWSER_LOST')); });
      if (browser.version() !== VERSION) refuse('PORTABLE_VERSION_MISMATCH');
      context = await browser.newContext({storageState:state,viewport:options.viewport,acceptDownloads:true,...(options.recordVideoDir ? {recordVideo:{dir:options.recordVideoDir,size:options.viewport}} : {})});
      if (options.observeClose) {
        for (const [target, method, phase] of [[context.request,'dispose','request-dispose'],[context.tracing,'stop','trace-stop'],[context.tracing,'stopChunk','trace-stop-chunk']]) {
          const original = target[method].bind(target);
          target[method] = (...args) => closePhase(options.observeClose, phase, () => original(...args));
        }
      }
      installPortableViewportSizing(context, options.observeClose);
      originalClose = context.close.bind(context);
      context.close = close;
      // auth.setup uses this API: refuse both memory export and file export in portable mode.
      context.storageState = async () => refuse('PORTABLE_STATE_EXPORT_FORBIDDEN');
      context.once('close', () => {
        if (!intentional) {
          unexpected.push(new PortableBrowserError('PORTABLE_CONTEXT_LOST'));
          void close().catch(() => {}); // Rejection remains retained for the caller's context.close.
        }
      });
      await installHostFlagSuppressor(context);
      await verifyIdentity(context, options.expected);
      if (unexpected.length) aggregate(unexpected, 'Portable browser lost during admission');
      receipts.set(context, Object.freeze({mode:MODE, browserVersion:browser.version(), principalSha256:sha(options.expected.accountId), uiVersion:options.expected.uiVersion, appUrl:APP_URL, executableSha256:EXECUTABLE_SHA256, frameworkSha256:FRAMEWORK_SHA256, admittedAt:new Date().toISOString()}));
      return context;
    } catch (error) {
      const errors = [error];
      try { await close(); } catch (cleanup) { errors.push(cleanup); }
      aggregate(errors,'Portable admission and cleanup failed; original errors retained');
    }
  };
}
