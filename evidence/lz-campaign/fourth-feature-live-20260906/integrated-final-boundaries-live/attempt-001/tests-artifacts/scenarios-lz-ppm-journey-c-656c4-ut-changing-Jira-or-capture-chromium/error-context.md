# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-simulation.spec.ts >> private simulation: scope, holiday and lag survive model save/reopen; excluded task can return without changing Jira or capture
- Location: scenarios/lz-ppm/journey-campaign-simulation.spec.ts:42:1

# Error details

```
ProfileReservationError: PROFILE_UNAVAILABLE: Unclean or unknown prior reservation; explicit recovery required
```

# Test source

```ts
  17  | export function assertProfileHasNoOwner(profile: string): void {
  18  |   const present = markers.filter(name => {
  19  |     try { fs.lstatSync(path.join(profile, name)); return true; }
  20  |     catch (error) {
  21  |       if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
  22  |       throw new ProfileReservationError("PROFILE_UNAVAILABLE", `Cannot inspect ${name}`, { cause: error });
  23  |     }
  24  |   });
  25  |   if (!present.length) return;
  26  |   const lock = path.join(profile, "SingletonLock");
  27  |   let target: string;
  28  |   try { target = fs.readlinkSync(lock); }
  29  |   catch (error) { throw new ProfileReservationError("PROFILE_UNAVAILABLE", `Markers exist without a readable owner: ${present.join(", ")}`, { cause: error }); }
  30  |   const separator = target.lastIndexOf("-");
  31  |   const hostname = target.slice(0, separator);
  32  |   const pidText = target.slice(separator + 1);
  33  |   if (hostname !== os.hostname() || !/^[1-9]\d*$/.test(pidText) || !Number.isSafeInteger(Number(pidText))) {
  34  |     throw new ProfileReservationError("PROFILE_UNAVAILABLE", "Malformed or foreign-host Chrome owner; markers preserved");
  35  |   }
  36  |   try { process.kill(Number(pidText), 0); }
  37  |   catch (error) {
  38  |     const code = (error as NodeJS.ErrnoException).code;
  39  |     if (code === "EPERM") throw new ProfileReservationError("PROFILE_BUSY", "Chrome owner exists but cannot be inspected; markers preserved");
  40  |     throw new ProfileReservationError("PROFILE_UNAVAILABLE", "Chrome owner cannot be established; explicit recovery required, markers preserved", { cause: error });
  41  |   }
  42  |   throw new ProfileReservationError("PROFILE_BUSY", "A live Chrome owner holds this profile; markers preserved");
  43  | }
  44  | 
  45  | type HolderMessage = { kind: string; reason?: string; holderPid?: number; lockFile?: string; profile?: string };
  46  | export interface ReservationOptions {
  47  |   /** Isolated process tests use a temporary private root. Normal callers use one shared root. */
  48  |   lockRoot?: string;
  49  |   python?: string;
  50  |   readinessTimeoutMs?: number;
  51  | }
  52  | export interface ProfileReservation {
  53  |   profile: string;
  54  |   lockFile: string;
  55  |   holderPid: number;
  56  |   assertHeld(): void;
  57  |   onLost(listener: (error: ProfileReservationError) => void): () => void;
  58  |   cleanClose(): Promise<void>;
  59  |   cancelUnlaunched(): Promise<void>;
  60  |   abandon(): void;
  61  | }
  62  | 
  63  | export async function reserveProfile(directory: string, options: ReservationOptions = {}): Promise<ProfileReservation> {
  64  |   fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  65  |   const profile = fs.realpathSync(directory);
  66  |   const lockRoot = options.lockRoot ?? path.join(os.homedir(), ".local", "state", "forge-live-harness", "profile-locks");
  67  |   const token = randomUUID();
  68  |   const holder = spawn(options.python ?? "python3", [fileURLToPath(new URL("./profile-holder.py", import.meta.url)), profile, lockRoot, token, String(process.pid)], { stdio: ["pipe", "pipe", "pipe"] });
  69  |   let failure: ProfileReservationError | undefined;
  70  |   let intentional = false;
  71  |   let released = false;
  72  |   let buffer = "";
  73  |   let pending: { resolve(value: HolderMessage): void; reject(error: Error): void; timer: NodeJS.Timeout } | undefined;
  74  |   const queued: HolderMessage[] = [];
  75  |   const listeners = new Set<(error: ProfileReservationError) => void>();
  76  |   const fail = (error: ProfileReservationError) => {
  77  |     failure ??= error;
  78  |     if (pending) { clearTimeout(pending.timer); pending.reject(failure); pending = undefined; }
  79  |     for (const listener of listeners) listener(failure);
  80  |   };
  81  |   const receive = (message: HolderMessage) => {
  82  |     if (pending) { const current = pending; pending = undefined; clearTimeout(current.timer); current.resolve(message); }
  83  |     else queued.push(message);
  84  |   };
  85  |   holder.stdout.on("data", chunk => {
  86  |     buffer += String(chunk);
  87  |     if (buffer.length > 64 * 1024) { fail(new ProfileReservationError("HOLDER_LOST", "Oversized holder response")); holder.stdin.end(); return; }
  88  |     let newline: number;
  89  |     while ((newline = buffer.indexOf("\n")) >= 0) {
  90  |       const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
  91  |       try { receive(JSON.parse(line) as HolderMessage); }
  92  |       catch { fail(new ProfileReservationError("HOLDER_LOST", "Malformed holder response")); holder.stdin.end(); }
  93  |     }
  94  |   });
  95  |   // Drain stderr without collecting environment/auth or noisy process internals.
  96  |   holder.stderr.resume();
  97  |   holder.stdin.on("error", error => { if (!intentional) fail(new ProfileReservationError("HOLDER_LOST", "Reservation pipe failed", { cause: error })); });
  98  |   holder.on("error", error => fail(new ProfileReservationError("HOLDER_LOST", "Cannot start reservation holder", { cause: error })));
  99  |   holder.on("exit", (code, signal) => { if (!intentional && !released) fail(new ProfileReservationError("HOLDER_LOST", `Reservation holder exited (${code ?? signal}); unclean intent retained`)); });
  100 |   const next = (): Promise<HolderMessage> => {
  101 |     const ready = queued.shift(); if (ready) return Promise.resolve(ready);
  102 |     if (failure) return Promise.reject(failure);
  103 |     if (pending) return Promise.reject(new Error("Concurrent holder command"));
  104 |     return new Promise((resolve, reject) => {
  105 |       const timer = setTimeout(() => {
  106 |         fail(new ProfileReservationError("HOLDER_LOST", "Reservation holder readiness timed out; no browser launched"));
  107 |         intentional = true; holder.stdin.end(); holder.kill("SIGTERM"); // only our own holder, never a browser
  108 |       }, options.readinessTimeoutMs ?? 5000);
  109 |       pending = { resolve, reject, timer };
  110 |     });
  111 |   };
  112 |   let acquired: HolderMessage;
  113 |   try { acquired = await next(); }
  114 |   catch (error) { intentional = true; holder.stdin.end(); throw error; }
  115 |   if (acquired.kind !== "acquired" || !acquired.lockFile || !acquired.holderPid || acquired.profile !== profile) {
  116 |     intentional = true; holder.stdin.end();
> 117 |     throw new ProfileReservationError(acquired.kind === "busy" ? "PROFILE_BUSY" : "PROFILE_UNAVAILABLE", acquired.reason ?? "Unknown reservation response");
      |           ^ ProfileReservationError: PROFILE_UNAVAILABLE: Unclean or unknown prior reservation; explicit recovery required
  118 |   }
  119 |   const assertHeld = () => { if (failure || intentional || released) throw failure ?? new ProfileReservationError("HOLDER_LOST", "Reservation is no longer held"); };
  120 |   const finish = async (command: "clean-close" | "cancel-unlaunched") => {
  121 |     if (released) return;
  122 |     assertHeld();
  123 |     holder.stdin.write(JSON.stringify({ command, token }) + "\n");
  124 |     const response = await next();
  125 |     if (response.kind !== "released") { intentional = true; holder.stdin.end(); throw new ProfileReservationError("PROFILE_UNAVAILABLE", response.reason ?? "Close not acknowledged"); }
  126 |     released = true; intentional = true; holder.stdin.end();
  127 |   };
  128 |   return {
  129 |     profile, lockFile: acquired.lockFile, holderPid: acquired.holderPid,
  130 |     assertHeld,
  131 |     onLost(listener) { listeners.add(listener); if (failure) listener(failure); return () => listeners.delete(listener); },
  132 |     abandon() { intentional = true; holder.stdin.end(); },
  133 |     cleanClose() { return finish("clean-close"); },
  134 |     cancelUnlaunched() { return finish("cancel-unlaunched"); },
  135 |   };
  136 | }
  137 | 
  138 | export interface ReservableContext {
  139 |   close(options?: { reason?: string }): Promise<void>;
  140 |   once(event: "close", listener: () => void): unknown;
  141 | }
  142 | 
  143 | /** Generic so isolated tests drive the real lifecycle without importing Playwright/auth. */
  144 | export async function launchReservedProfile<T extends ReservableContext>(
  145 |   directory: string,
  146 |   launch: (profile: string, channel: "chrome" | "chromium") => Promise<T>,
  147 |   options: ReservationOptions = {},
  148 | ): Promise<T> {
  149 |   const reservation = await reserveProfile(directory, options);
  150 |   let context: T | undefined;
  151 |   let closeOwned: (() => Promise<void>) | undefined;
  152 |   let lost: ProfileReservationError | undefined;
  153 |   let attemptedLaunch = false;
  154 |   reservation.onLost(error => {
  155 |     lost = error;
  156 |     if (closeOwned) void closeOwned().catch(() => {}); // only this launch's returned context
  157 |   });
  158 |   try {
  159 |     assertProfileHasNoOwner(reservation.profile);
  160 |     reservation.assertHeld();
  161 |     try { attemptedLaunch = true; context = await launch(reservation.profile, "chrome"); }
  162 |     catch (chromeError) {
  163 |       // Installed Playwright emits this before spawning. Unknown failures are NOT safe retries.
  164 |       if (!(chromeError instanceof Error) || !chromeError.message.includes("Chromium distribution 'chrome' is not found")) throw chromeError;
  165 |       reservation.assertHeld(); assertProfileHasNoOwner(reservation.profile);
  166 |       try { context = await launch(reservation.profile, "chromium"); }
  167 |       catch (chromiumError) { throw new AggregateError([chromeError, chromiumError], "Chrome unavailable and bundled Chromium launch failed; both causes retained"); }
  168 |     }
  169 |     const originalClose = context.close.bind(context);
  170 |     closeOwned = () => originalClose();
  171 |     if (lost) { await originalClose().catch(() => {}); throw lost; }
  172 |     reservation.assertHeld();
  173 |     let explicitClose = false;
  174 |     let closing: Promise<void> | undefined;
  175 |     context.once("close", () => { if (!explicitClose) reservation.abandon(); });
  176 |     context.close = (closeOptions) => {
  177 |       closing ??= (async () => {
  178 |         explicitClose = true;
  179 |         try { await originalClose(closeOptions); await reservation.cleanClose(); }
  180 |         catch (error) { reservation.abandon(); throw error; }
  181 |       })();
  182 |       return closing;
  183 |     };
  184 |     return context;
  185 |   } catch (error) {
  186 |     if (!attemptedLaunch) await reservation.cancelUnlaunched().catch(() => reservation.abandon());
  187 |     else reservation.abandon();
  188 |     throw error;
  189 |   }
  190 | }
  191 | 
```