import { reserveProfile, launchReservedProfile } from '../../forge/profile-reservation.ts';
import { EventEmitter } from 'node:events';
const [mode, profile, lockRoot] = process.argv.slice(2);
if (mode === 'reserve') {
  try {
    const r = await reserveProfile(profile, { lockRoot });
    process.stdout.write(JSON.stringify({ kind: 'acquired', holderPid: r.holderPid, lockFile: r.lockFile }) + '\n');
    process.stdin.on('data', async chunk => {
      if (String(chunk).trim() === 'exit') process.exit(0);
      if (String(chunk).trim() === 'close') { await r.cleanClose(); process.stdout.write('{"kind":"closed"}\n'); process.stdin.destroy(); }
    });
  } catch (error) { process.stdout.write(JSON.stringify({ kind: 'denied', code: (error as { code?: string }).code }) + '\n'); }
} else if (mode === 'launch') {
  class Context extends EventEmitter {
    async close() { this.emit('close'); }
  }
  try {
    const context = await launchReservedProfile(profile, async () => {
      process.stdout.write('{"kind":"entered"}\n');
      return new Context();
    }, { lockRoot });
    process.stdin.on('data', async () => { await context.close(); process.stdout.write('{"kind":"closed"}\n'); process.stdin.destroy(); });
  } catch (error) { process.stdout.write(JSON.stringify({ kind: 'denied', code: (error as { code?: string }).code }) + '\n'); }
}
