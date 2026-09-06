import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export class ProfileReservationError extends Error {
  constructor(public code: "PROFILE_BUSY" | "PROFILE_UNAVAILABLE" | "HOLDER_LOST", message: string, options?: ErrorOptions) {
    super(`${code}: ${message}`, options);
    this.name = "ProfileReservationError";
  }
}
const markers = ["SingletonLock", "SingletonSocket", "SingletonCookie", "RunningChromeVersion"];

/** Inspection only. Even a parsed dead PID is not permission to unlink anything. */
export function assertProfileHasNoOwner(profile: string): void {
  const present = markers.filter(name => {
    try { fs.lstatSync(path.join(profile, name)); return true; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw new ProfileReservationError("PROFILE_UNAVAILABLE", `Cannot inspect ${name}`, { cause: error });
    }
  });
  if (!present.length) return;
  const lock = path.join(profile, "SingletonLock");
  let target: string;
  try { target = fs.readlinkSync(lock); }
  catch (error) { throw new ProfileReservationError("PROFILE_UNAVAILABLE", `Markers exist without a readable owner: ${present.join(", ")}`, { cause: error }); }
  const separator = target.lastIndexOf("-");
  const hostname = target.slice(0, separator);
  const pidText = target.slice(separator + 1);
  if (hostname !== os.hostname() || !/^[1-9]\d*$/.test(pidText) || !Number.isSafeInteger(Number(pidText))) {
    throw new ProfileReservationError("PROFILE_UNAVAILABLE", "Malformed or foreign-host Chrome owner; markers preserved");
  }
  try { process.kill(Number(pidText), 0); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM") throw new ProfileReservationError("PROFILE_BUSY", "Chrome owner exists but cannot be inspected; markers preserved");
    throw new ProfileReservationError("PROFILE_UNAVAILABLE", "Chrome owner cannot be established; explicit recovery required, markers preserved", { cause: error });
  }
  throw new ProfileReservationError("PROFILE_BUSY", "A live Chrome owner holds this profile; markers preserved");
}

type HolderMessage = { kind: string; reason?: string; holderPid?: number; lockFile?: string; profile?: string };
export interface ReservationOptions {
  /** Isolated process tests use a temporary private root. Normal callers use one shared root. */
  lockRoot?: string;
  python?: string;
  readinessTimeoutMs?: number;
}
export interface ProfileReservation {
  profile: string;
  lockFile: string;
  holderPid: number;
  assertHeld(): void;
  onLost(listener: (error: ProfileReservationError) => void): () => void;
  cleanClose(): Promise<void>;
  cancelUnlaunched(): Promise<void>;
  abandon(): void;
}

export async function reserveProfile(directory: string, options: ReservationOptions = {}): Promise<ProfileReservation> {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const profile = fs.realpathSync(directory);
  const lockRoot = options.lockRoot ?? path.join(os.homedir(), ".local", "state", "forge-live-harness", "profile-locks");
  const token = randomUUID();
  const holder = spawn(options.python ?? "python3", [fileURLToPath(new URL("./profile-holder.py", import.meta.url)), profile, lockRoot, token, String(process.pid)], { stdio: ["pipe", "pipe", "pipe"] });
  let failure: ProfileReservationError | undefined;
  let intentional = false;
  let released = false;
  let buffer = "";
  let pending: { resolve(value: HolderMessage): void; reject(error: Error): void; timer: NodeJS.Timeout } | undefined;
  const queued: HolderMessage[] = [];
  const listeners = new Set<(error: ProfileReservationError) => void>();
  const fail = (error: ProfileReservationError) => {
    failure ??= error;
    if (pending) { clearTimeout(pending.timer); pending.reject(failure); pending = undefined; }
    for (const listener of listeners) listener(failure);
  };
  const receive = (message: HolderMessage) => {
    if (pending) { const current = pending; pending = undefined; clearTimeout(current.timer); current.resolve(message); }
    else queued.push(message);
  };
  holder.stdout.on("data", chunk => {
    buffer += String(chunk);
    if (buffer.length > 64 * 1024) { fail(new ProfileReservationError("HOLDER_LOST", "Oversized holder response")); holder.stdin.end(); return; }
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      try { receive(JSON.parse(line) as HolderMessage); }
      catch { fail(new ProfileReservationError("HOLDER_LOST", "Malformed holder response")); holder.stdin.end(); }
    }
  });
  // Drain stderr without collecting environment/auth or noisy process internals.
  holder.stderr.resume();
  holder.stdin.on("error", error => { if (!intentional) fail(new ProfileReservationError("HOLDER_LOST", "Reservation pipe failed", { cause: error })); });
  holder.on("error", error => fail(new ProfileReservationError("HOLDER_LOST", "Cannot start reservation holder", { cause: error })));
  holder.on("exit", (code, signal) => { if (!intentional && !released) fail(new ProfileReservationError("HOLDER_LOST", `Reservation holder exited (${code ?? signal}); unclean intent retained`)); });
  const next = (): Promise<HolderMessage> => {
    const ready = queued.shift(); if (ready) return Promise.resolve(ready);
    if (failure) return Promise.reject(failure);
    if (pending) return Promise.reject(new Error("Concurrent holder command"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        fail(new ProfileReservationError("HOLDER_LOST", "Reservation holder readiness timed out; no browser launched"));
        intentional = true; holder.stdin.end(); holder.kill("SIGTERM"); // only our own holder, never a browser
      }, options.readinessTimeoutMs ?? 5000);
      pending = { resolve, reject, timer };
    });
  };
  let acquired: HolderMessage;
  try { acquired = await next(); }
  catch (error) { intentional = true; holder.stdin.end(); throw error; }
  if (acquired.kind !== "acquired" || !acquired.lockFile || !acquired.holderPid || acquired.profile !== profile) {
    intentional = true; holder.stdin.end();
    throw new ProfileReservationError(acquired.kind === "busy" ? "PROFILE_BUSY" : "PROFILE_UNAVAILABLE", acquired.reason ?? "Unknown reservation response");
  }
  const assertHeld = () => { if (failure || intentional || released) throw failure ?? new ProfileReservationError("HOLDER_LOST", "Reservation is no longer held"); };
  const finish = async (command: "clean-close" | "cancel-unlaunched") => {
    if (released) return;
    assertHeld();
    holder.stdin.write(JSON.stringify({ command, token }) + "\n");
    const response = await next();
    if (response.kind !== "released") { intentional = true; holder.stdin.end(); throw new ProfileReservationError("PROFILE_UNAVAILABLE", response.reason ?? "Close not acknowledged"); }
    released = true; intentional = true; holder.stdin.end();
  };
  return {
    profile, lockFile: acquired.lockFile, holderPid: acquired.holderPid,
    assertHeld,
    onLost(listener) { listeners.add(listener); if (failure) listener(failure); return () => listeners.delete(listener); },
    abandon() { intentional = true; holder.stdin.end(); },
    cleanClose() { return finish("clean-close"); },
    cancelUnlaunched() { return finish("cancel-unlaunched"); },
  };
}

export interface ReservableContext {
  close(options?: { reason?: string }): Promise<void>;
  once(event: "close", listener: () => void): unknown;
}

/** Generic so isolated tests drive the real lifecycle without importing Playwright/auth. */
export async function launchReservedProfile<T extends ReservableContext>(
  directory: string,
  launch: (profile: string, channel: "chrome" | "chromium") => Promise<T>,
  options: ReservationOptions = {},
): Promise<T> {
  const reservation = await reserveProfile(directory, options);
  let context: T | undefined;
  let closeOwned: (() => Promise<void>) | undefined;
  let lost: ProfileReservationError | undefined;
  let attemptedLaunch = false;
  reservation.onLost(error => {
    lost = error;
    if (closeOwned) void closeOwned().catch(() => {}); // only this launch's returned context
  });
  try {
    assertProfileHasNoOwner(reservation.profile);
    reservation.assertHeld();
    try { attemptedLaunch = true; context = await launch(reservation.profile, "chrome"); }
    catch (chromeError) {
      // Installed Playwright emits this before spawning. Unknown failures are NOT safe retries.
      if (!(chromeError instanceof Error) || !chromeError.message.includes("Chromium distribution 'chrome' is not found")) throw chromeError;
      reservation.assertHeld(); assertProfileHasNoOwner(reservation.profile);
      try { context = await launch(reservation.profile, "chromium"); }
      catch (chromiumError) { throw new AggregateError([chromeError, chromiumError], "Chrome unavailable and bundled Chromium launch failed; both causes retained"); }
    }
    const originalClose = context.close.bind(context);
    closeOwned = () => originalClose();
    if (lost) { await originalClose().catch(() => {}); throw lost; }
    reservation.assertHeld();
    let explicitClose = false;
    let closing: Promise<void> | undefined;
    context.once("close", () => { if (!explicitClose) reservation.abandon(); });
    context.close = (closeOptions) => {
      closing ??= (async () => {
        explicitClose = true;
        try { await originalClose(closeOptions); await reservation.cleanClose(); }
        catch (error) { reservation.abandon(); throw error; }
      })();
      return closing;
    };
    return context;
  } catch (error) {
    if (!attemptedLaunch) await reservation.cancelUnlaunched().catch(() => reservation.abandon());
    else reservation.abandon();
    throw error;
  }
}
