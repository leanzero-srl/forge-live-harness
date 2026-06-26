// Bounded poll to a deterministic terminal state — the core of zero-flakiness for
// async/trigger-driven effects (seal revert, validation comment, reindex). Returns
// the first truthy value of `fn`, or throws a clear timeout (never silently passes).
export interface WaitOpts {
  timeout?: number;
  interval?: number;
  label?: string;
}

export async function waitForTerminal<T>(
  fn: () => Promise<T | null | undefined | false>,
  o: WaitOpts = {},
): Promise<T> {
  const timeout = o.timeout ?? 30_000;
  const interval = o.interval ?? 1_500;
  const deadline = Date.now() + timeout;
  let last: unknown;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v as T;
      last = v;
    } catch (e) {
      last = (e as Error)?.message ?? e;
    }
    if (Date.now() > deadline) {
      throw new Error(`waitForTerminal timed out after ${timeout}ms${o.label ? ` (${o.label})` : ""}; last=${JSON.stringify(last)?.slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}
