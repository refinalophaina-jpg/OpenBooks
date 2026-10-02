#!/usr/bin/env node
/**
 * OpenBooks — mirror daemon
 *
 * Periodically probes LibGen / Anna's Archive mirrors and writes the
 * live list to data/mirrors.json, so the crawler and frontend always
 * have a working domain even as these sites rotate and go down.
 *
 * Usage:
 *   node mirror-daemon.js              # runs forever, checks every 6h
 *   node mirror-daemon.js --once       # single check then exit (for cron)
 *   node mirror-daemon.js --interval 1 # check every 1 hour
 *
 * For a system scheduler, use --once and let cron/launchd handle timing.
 */

const mirrors = require('./mirrors');

const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const iIdx = args.indexOf('--interval');
const INTERVAL_HOURS = iIdx !== -1 && args[iIdx + 1] ? parseFloat(args[iIdx + 1]) : 6;
const INTERVAL_MS = Math.max(0.1, INTERVAL_HOURS) * 60 * 60 * 1000;

function stamp() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

async function runCheck() {
  const t0 = Date.now();
  try {
    const data = await mirrors.checkAll();
    mirrors.save(data);
    const lg = data.libgen.live.length;
    const an = data.anna.live.length;
    const dl = data.libgenDownload.live.length;
    console.log(`[${stamp()}] checked in ${Date.now()-t0}ms — LibGen:${lg} live, Anna:${an} live, Download:${dl} live`);
    console.log(`           → libgen=${data.libgen.live[0]||'(none)'}  anna=${data.anna.live[0]||'(none)'}`);
  } catch (e) {
    console.error(`[${stamp()}] check failed: ${e.message}`);
  }
}

(async () => {
  console.log(`OpenBooks mirror daemon — ${ONCE ? 'one-shot' : `every ${INTERVAL_HOURS}h`}`);
  await runCheck();
  if (ONCE) process.exit(0);

  setInterval(runCheck, INTERVAL_MS);
  console.log(`[${stamp()}] daemon running; next check in ${INTERVAL_HOURS}h. Ctrl+C to stop.`);
})();

// graceful shutdown
process.on('SIGINT',  () => { console.log('\nmirror daemon stopped.'); process.exit(0); });
process.on('SIGTERM', () => { process.exit(0); });
