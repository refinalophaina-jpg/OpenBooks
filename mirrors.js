#!/usr/bin/env node
/**
 * OpenBooks — mirror registry
 *
 * Candidate LibGen / Anna's Archive domains rotate and go down often.
 * This module probes them and reports which are live, so the crawler
 * and the frontend always use a working domain.
 *
 * Used by:
 *   - crawl.js         (reads data/mirrors.json if present)
 *   - mirror-daemon.js (writes data/mirrors.json on a schedule)
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const MIRRORS_FILE = path.join(__dirname, 'data', 'mirrors.json');

// ── candidate domains ───────────────────────────────────────────
// LibGen search endpoints (full base URL, no trailing slash)
const LIBGEN_CANDIDATES = [
  'https://libgen.is',
  'https://libgen.rs',
  'https://libgen.st',
  'https://libgen.gs',
  'https://libgen.li',
  'https://libgen.vg',
  'https://libgen.la',
  'https://libgen.bz',
  'https://libgen.gl',
  'http://libgen.is',
];

// LibGen download gateways (used with ?md5=HASH or /main/HASH)
const LIBGEN_DOWNLOAD_CANDIDATES = [
  'https://library.lol',
  'https://libgen.lc',
  'https://libgen.rocks',
  'https://libgen.li',
];

// Anna's Archive mirrors
const ANNA_CANDIDATES = [
  'https://annas-archive.org',
  'https://annas-archive.se',
  'https://annas-archive.li',
];

// ── probe helper ─────────────────────────────────────────────────
function probe(base, probePath = '/', timeout = 7000) {
  return new Promise(resolve => {
    const url = base + probePath;
    const mod = url.startsWith('https') ? https : http;
    const started = Date.now();
    let done = false;
    const finish = (res) => { if (!done) { done = true; resolve(res); } };

    const req = mod.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (OpenBooks mirror-check)' },
    }, r => {
      // Drain minimal data then decide
      let bytes = 0;
      r.on('data', d => { bytes += d.length; if (bytes > 2048) r.destroy(); });
      r.on('end',   () => finish({ up: true, status: r.statusCode, ms: Date.now() - started, bytes }));
      r.on('close', () => finish({ up: true, status: r.statusCode, ms: Date.now() - started, bytes }));
    });
    req.on('error', e => finish({ up: false, error: e.code || e.message, ms: Date.now() - started }));
    req.setTimeout(timeout, () => { req.destroy(); finish({ up: false, error: 'timeout', ms: Date.now() - started }); });
  });
}

// A mirror is "healthy" if it answered with a usable status code.
// 200 is ideal; 3xx (redirect) and even 403 mean the host is reachable,
// but we only trust 200/3xx for actual use.
function isHealthy(result) {
  return result.up && result.status && result.status < 400;
}

// ── probe a candidate list ───────────────────────────────────────
async function checkGroup(candidates, probePath) {
  const results = await Promise.all(
    candidates.map(async base => ({ base, ...(await probe(base, probePath)) }))
  );
  // Live = healthy, sorted fastest first
  const live = results
    .filter(isHealthy)
    .sort((a, b) => a.ms - b.ms)
    .map(r => r.base);
  return { live, results };
}

// ── full check ───────────────────────────────────────────────────
async function checkAll() {
  const [libgen, anna] = await Promise.all([
    checkGroup(LIBGEN_CANDIDATES, '/'),
    checkGroup(ANNA_CANDIDATES, '/'),
  ]);
  // Download gateways: probe root, they rarely give 200 so accept any response
  const dlResults = await Promise.all(
    LIBGEN_DOWNLOAD_CANDIDATES.map(async base => ({ base, ...(await probe(base, '/') ) }))
  );
  const download = dlResults.filter(r => r.up).sort((a,b) => a.ms - b.ms).map(r => r.base);

  return {
    updated: new Date().toISOString(),
    libgen: {
      live: libgen.live,
      detail: libgen.results,
    },
    libgenDownload: {
      live: download.length ? download : LIBGEN_DOWNLOAD_CANDIDATES.slice(0, 1),
      detail: dlResults,
    },
    anna: {
      live: anna.live,
      detail: anna.results,
    },
  };
}

// ── persistence ──────────────────────────────────────────────────
function save(data) {
  fs.mkdirSync(path.dirname(MIRRORS_FILE), { recursive: true });
  fs.writeFileSync(MIRRORS_FILE, JSON.stringify(data, null, 2));
  return MIRRORS_FILE;
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(MIRRORS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// Best working mirror for a group, with safe fallback to first candidate
function bestLibGen()         { const m = load(); return m?.libgen?.live?.[0]         || LIBGEN_CANDIDATES[0]; }
function bestLibGenDownload() { const m = load(); return m?.libgenDownload?.live?.[0] || LIBGEN_DOWNLOAD_CANDIDATES[0]; }
function bestAnna()           { const m = load(); return m?.anna?.live?.[0]           || ANNA_CANDIDATES[0]; }
function liveLibGen()         { const m = load(); return (m?.libgen?.live?.length ? m.libgen.live : LIBGEN_CANDIDATES); }

module.exports = {
  LIBGEN_CANDIDATES, LIBGEN_DOWNLOAD_CANDIDATES, ANNA_CANDIDATES,
  MIRRORS_FILE,
  probe, checkAll, save, load,
  bestLibGen, bestLibGenDownload, bestAnna, liveLibGen,
};

// ── CLI: `node mirrors.js` runs a one-shot check and prints a report
if (require.main === module) {
  (async () => {
    console.log('Probing mirrors…\n');
    const data = await checkAll();

    const fmt = group => group.detail
      .map(r => `    ${r.up ? (r.status < 400 ? '✓' : '△') : '✗'} ${r.base.padEnd(32)} ${r.up ? (r.status + ' ' + r.ms + 'ms') : r.error}`)
      .join('\n');

    console.log('LibGen search:');       console.log(fmt(data.libgen));
    console.log('\nLibGen download:');    console.log(fmt(data.libgenDownload));
    console.log("\nAnna's Archive:");     console.log(fmt(data.anna));

    const p = save(data);
    console.log(`\nLive LibGen:   ${data.libgen.live[0] || '(none)'}`);
    console.log(`Live Download: ${data.libgenDownload.live[0] || '(none)'}`);
    console.log(`Live Anna's:   ${data.anna.live[0] || '(none)'}`);
    console.log(`\nSaved → ${p}`);
  })();
}
