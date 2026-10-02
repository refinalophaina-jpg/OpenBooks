#!/usr/bin/env node
/**
 * OpenBooks — file downloader
 *
 * Reads data/crawl-results.json and downloads actual book files
 * (PDF / EPUB) to ./library/<section>/<title>.<ext>.
 *
 * Download sources, in priority order per book:
 *   1. Internet Archive open-access  → archive.org/metadata resolves the file
 *   2. LibGen (MD5 via library.lol)  → parses the GET link, then downloads
 *
 * LibGen needs a live mirror — run `npm run mirrors` first if downloads
 * fail with "no mirror". Internet Archive open-access works without it.
 *
 * Usage:
 *   node download.js                 # download everything obtainable
 *   node download.js --open-only     # only legal open-access (IA, Gutenberg)
 *   node download.js --section BOOKS # only one section
 *   node download.js --dry-run       # show what would download, fetch nothing
 *   node download.js --limit 5       # stop after N successful downloads
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');

const DATA    = path.join(__dirname, 'data', 'crawl-results.json');
const OUTROOT = path.join(__dirname, 'library');

const args      = process.argv.slice(2);
const OPEN_ONLY = args.includes('--open-only');
const DRY_RUN   = args.includes('--dry-run');
const secIdx    = args.indexOf('--section');
const SECTION   = secIdx !== -1 ? (args[secIdx + 1] || '').toUpperCase() : null;
const limIdx    = args.indexOf('--limit');
const LIMIT     = limIdx !== -1 ? parseInt(args[limIdx + 1]) : Infinity;

const UA = 'Mozilla/5.0 (OpenBooks downloader; educational use)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── HTTP helpers ─────────────────────────────────────────────────
function fetchText(url, timeout = 20000, redirects = 5) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': UA, 'Accept': '*/*' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        const next = new URL(res.headers.location, url).href;
        res.resume();
        return fetchText(next, timeout, redirects - 1).then(resolve, reject);
      }
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Download a URL straight to disk with a simple progress readout.
function downloadFile(url, destPath, label, timeout = 120000, redirects = 6) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': UA, 'Accept': '*/*' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        const next = new URL(res.headers.location, url).href;
        res.resume();
        return downloadFile(next, destPath, label, timeout, redirects - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const total = parseInt(res.headers['content-length'] || '0');
      const ctype  = (res.headers['content-type'] || '').toLowerCase();
      // Reject HTML error pages masquerading as files
      if (ctype.includes('text/html')) {
        res.resume();
        return reject(new Error('got HTML, not a file'));
      }
      const tmp = destPath + '.part';
      const out = fs.createWriteStream(tmp);
      let got = 0, lastPct = -1;
      res.on('data', d => {
        got += d.length;
        if (total) {
          const pct = Math.floor(got / total * 100 / 5) * 5;
          if (pct !== lastPct) { lastPct = pct; process.stdout.write(`\r    ↓ ${label} ${pct}% (${(got/1048576).toFixed(1)}MB)   `); }
        } else {
          process.stdout.write(`\r    ↓ ${label} ${(got/1048576).toFixed(1)}MB   `);
        }
      });
      res.pipe(out);
      out.on('finish', () => {
        out.close(() => {
          fs.renameSync(tmp, destPath);
          process.stdout.write(`\r    ✓ ${label} (${(got/1048576).toFixed(1)}MB)            \n`);
          resolve({ bytes: got, path: destPath });
        });
      });
      out.on('error', e => { try { fs.unlinkSync(tmp); } catch {} reject(e); });
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ── source resolvers ─────────────────────────────────────────────
// Internet Archive: resolve the best text file (PDF/EPUB) from metadata.
async function resolveArchive(item) {
  const a = item.archive;
  if (!a || !a.found || a.access !== 'open' || !a.identifier) return null;
  try {
    const { body } = await fetchText(`https://archive.org/metadata/${a.identifier}`);
    const meta = JSON.parse(body);
    const files = meta.files || [];
    // Prefer EPUB, then PDF (smaller/cleaner), skip _text.pdf OCR dupes
    const pick = ext => files.find(f => (f.name || '').toLowerCase().endsWith(ext) && !/_text\.pdf$/i.test(f.name));
    const f = pick('.epub') || pick('.pdf');
    if (!f) return null;
    const ext = f.name.toLowerCase().endsWith('.epub') ? 'epub' : 'pdf';
    return {
      url: `https://archive.org/download/${a.identifier}/${encodeURIComponent(f.name)}`,
      ext,
      source: 'Internet Archive (open)',
      legal: true,
      verifyTitle: meta.metadata && meta.metadata.title,
    };
  } catch { return null; }
}

// LibGen: library.lol/main/MD5 is an HTML page with a GET link to the file.
async function resolveLibGen(item) {
  const lg = item.libgen;
  if (!lg || !lg.found || !lg.md5) return null;
  const pages = [
    `https://library.lol/main/${lg.md5}`,
    `https://libgen.lc/ads.php?md5=${lg.md5}`,
    lg.download_url,
  ].filter(Boolean);
  for (const page of pages) {
    try {
      const { body, status } = await fetchText(page);
      if (status !== 200 || !body) continue;
      // The GET link: <div id="download"><h2><a href="...">GET</a>
      let m = body.match(/<a[^>]+href="([^"]+)"[^>]*>\s*GET\s*</i)
           || body.match(/href="(https?:\/\/[^"]+\.(?:pdf|epub|mobi|djvu)[^"]*)"/i)
           || body.match(/href="(https?:\/\/[^"]*(?:ipfs|download)[^"]+)"/i);
      if (m) {
        const url = new URL(m[1], page).href;
        const ext = (lg.format || (url.match(/\.(pdf|epub|mobi|djvu)/i)?.[1]) || 'pdf').toLowerCase();
        return { url, ext, source: 'LibGen', legal: false, verifyTitle: lg.title };
      }
    } catch { /* try next */ }
  }
  return null;
}

// ── helpers ──────────────────────────────────────────────────────
function safeName(s) {
  return (s || 'untitled').replace(/[^\w\s.-]/g, '').replace(/\s+/g, '-').slice(0, 80);
}
function allBooks(d) {
  const out = [];
  for (const s of d.sections) {
    const take = it => { if (it.type === 'Book') out.push(it); };
    (s.items || []).forEach(take);
    (s.subsections || []).forEach(sub => (sub.items || []).forEach(take));
  }
  return out;
}

// ── main ─────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(DATA)) {
    console.error('✗ data/crawl-results.json not found. Run `node crawl.js` first.');
    process.exit(1);
  }
  const d = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  let books = allBooks(d);
  if (SECTION) books = books.filter(b => (b.section || '').toUpperCase().includes(SECTION));

  console.log(`OpenBooks downloader — ${books.length} books${SECTION ? ` in ${SECTION}` : ''}`);
  console.log(OPEN_ONLY ? 'Mode: open-access only (legal sources)\n' : 'Mode: all obtainable sources\n');
  if (DRY_RUN) console.log('(dry run — nothing will be downloaded)\n');

  let ok = 0, skip = 0, fail = 0;

  for (const book of books) {
    if (ok >= LIMIT) { console.log(`\nReached --limit ${LIMIT}.`); break; }
    const title = book.title || '(untitled)';
    console.log(`• ${title.slice(0, 60)}${book.author ? '  — ' + book.author : ''}`);

    // Resolve a source
    let src = await resolveArchive(book);
    if (!src && !OPEN_ONLY) src = await resolveLibGen(book);

    if (!src) {
      console.log('    – no downloadable file (try Anna\'s Archive link in the app)');
      skip++; continue;
    }

    // Warn on likely title mismatch
    if (src.verifyTitle && title) {
      const a = title.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12);
      const b = String(src.verifyTitle).toLowerCase().replace(/[^a-z]/g, '').slice(0, 12);
      if (a && b && !b.includes(a.slice(0, 6)) && !a.includes(b.slice(0, 6))) {
        console.log(`    ⚠ source title is "${src.verifyTitle}" — may be a wrong match, verify before trusting`);
      }
    }

    const dir  = path.join(OUTROOT, safeName(book.section || 'Books'));
    const dest = path.join(dir, `${safeName(title)}.${src.ext}`);

    if (fs.existsSync(dest)) { console.log(`    ⤼ already have ${path.basename(dest)}`); skip++; continue; }
    if (DRY_RUN) { console.log(`    → would download from ${src.source}: ${src.url.slice(0, 70)}`); ok++; continue; }

    fs.mkdirSync(dir, { recursive: true });
    try {
      await downloadFile(src.url, dest, `${src.source} .${src.ext}`);
      ok++;
      await sleep(800); // polite
    } catch (e) {
      console.log(`    ✗ ${src.source} failed: ${e.message}`);
      fail++;
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Downloaded: ${ok}   Skipped: ${skip}   Failed: ${fail}`);
  if (!DRY_RUN && ok) console.log(`Files in → ${OUTROOT}/`);
}

main().catch(e => { console.error('\nDownloader error:', e); process.exit(1); });
