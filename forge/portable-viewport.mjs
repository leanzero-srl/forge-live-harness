// Install only on the owned ephemeral Chromium context. Its caller retains the
// browser lifecycle and admission gates. No persistent profile or app DOM access.
const installed = new WeakSet();
function combine(errors, message) {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, message);
}
function dimensions(page) {
  const value = page.viewportSize();
  if (!value || !Number.isSafeInteger(value.width) || value.width < 1 || !Number.isSafeInteger(value.height) || value.height < 1) throw new Error('PORTABLE_VIEWPORT_SIZE_REQUIRED');
  return value;
}
export function installPortableViewportSizing(context) {
  if (installed.has(context)) return;
  installed.add(context);
  let tail = Promise.resolve(), teardown = false;
  const pages = new WeakSet();
  const originalNewPage = context.newPage.bind(context);
  const originalContextClose = context.close.bind(context);
  const enqueue = work => {
    const task = tail.then(work);
    tail = task.catch(() => {}); // Caller retains rejection; one error cannot poison cleanup.
    return task;
  };
  async function synchronize() {
    if (teardown) return;
    const sessions = [], errors = [], windows = new Map();
    try {
      for (const page of context.pages().filter(page => !page.isClosed())) {
        const viewport = dimensions(page);
        const session = await context.newCDPSession(page);
        sessions.push(session);
        const {windowId} = await session.send('Browser.getWindowForTarget');
        if (!Number.isSafeInteger(windowId)) throw new Error('PORTABLE_WINDOW_ID_INVALID');
        const group = windows.get(windowId) || {session, width:0, height:0};
        group.width = Math.max(group.width, viewport.width);
        group.height = Math.max(group.height, viewport.height);
        windows.set(windowId, group);
      }
      if (!teardown) for (const [windowId, group] of windows) {
        await group.session.send('Browser.setContentsSize', {windowId,width:group.width,height:group.height});
      }
    } catch (error) { errors.push(error); }
    for (const session of sessions) try { await session.detach(); } catch (error) { errors.push(error); }
    combine(errors, 'Portable contents sizing and protocol cleanup failed');
  }
  function wrap(page) {
    if (pages.has(page)) return;
    pages.add(page);
    const originalResize = page.setViewportSize.bind(page);
    const originalClose = page.close.bind(page);
    page.setViewportSize = size => enqueue(async () => {
      if (teardown) throw new Error('PORTABLE_CONTEXT_CLOSING');
      await originalResize(size);
      await synchronize();
    });
    page.close = options => enqueue(async () => {
      const errors = [];
      try { await originalClose(options); } catch (error) { errors.push(error); }
      try { await synchronize(); } catch (error) { errors.push(error); }
      combine(errors, 'Portable page close and surviving contents sizing failed');
    });
  }
  for (const page of context.pages()) wrap(page);
  context.newPage = (...args) => enqueue(async () => {
    if (teardown) throw new Error('PORTABLE_CONTEXT_CLOSING');
    const page = await originalNewPage(...args);
    // Keep the original close for failure cleanup: calling the queued wrapper
    // from inside this transaction would deadlock.
    const closeCreated = page.close.bind(page);
    wrap(page);
    try {
      if (teardown) throw new Error('PORTABLE_CONTEXT_CLOSING');
      await synchronize();
    }
    catch (error) {
      const errors = [error];
      try { await closeCreated(); } catch (cleanup) { errors.push(cleanup); }
      try { await synchronize(); } catch (cleanup) { errors.push(cleanup); }
      combine(errors, 'Portable new page sizing and owned page cleanup failed');
    }
    return page;
  });
  context.close = options => {
    teardown = true; // Do not issue window repair while context shutdown is requested.
    return enqueue(() => originalContextClose(options));
  };
}
