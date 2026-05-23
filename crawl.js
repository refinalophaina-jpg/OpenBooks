#!/usr/bin/env node
/**
 * OpenBooks — resource crawler
 * Queries: Open Library, Internet Archive, TED transcripts, OpenAlex
 * No API keys required. Saves to data/crawl-results.json
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

// ── rate-limit helpers ──────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function get(url, { json = true, timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'OpenBooks-Crawler/1.0 (educational; contact: openbooks)',
        'Accept': json ? 'application/json' : 'text/html,text/plain',
      },
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location, { json, timeout }).then(resolve).catch(reject);
        }
        if (json) {
          try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
          catch { resolve({ status: res.statusCode, data: null, raw: body.slice(0, 400) }); }
        } else {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function enc(s) { return encodeURIComponent(s); }
function trim(s, n = 80) { return s && s.length > n ? s.slice(0, n) + '…' : s; }

// ── full resource list ──────────────────────────────────────────
const RESOURCE_LIST = `
=======================================================
SECTION 1: BOOKS
=======================================================

FOUNDATIONAL EQ

Emotional Intelligence: Why It Can Matter More Than IQ — Daniel Goleman (1995)
Emotional Intelligence 2.0 — Travis Bradberry & Jean Greaves (2009)
Permission to Feel — Marc Brackett (2019)
Emotional Agility — Susan David (2016)
Working with Emotional Intelligence — Daniel Goleman (1998)

RELATIONSHIPS & COMMUNICATION

The Seven Principles for Making Marriage Work — John Gottman & Nan Silver (1999)
Nonviolent Communication: A Language of Life — Marshall B. Rosenberg (1999)
Attached — Amir Levine & Rachel Heller (2010)
Mating in Captivity — Esther Perel (2006)
The State of Affairs — Esther Perel (2017)
Us — Terrence Real (2022)
How to Win Friends and Influence People — Dale Carnegie (1936)
The Language of Emotional Intelligence — Jeanne Segal

MEN, MASCULINITY & INNER WORK

I Don't Want to Talk About It — Terrence Real (1997)
Daring Greatly — Brené Brown (2012)
Atlas of the Heart — Brené Brown (2021)
The Way of the Superior Man — David Deida (1997)
Adult Children of Emotionally Immature Parents — Lindsay C. Gibson (2015)
The Masculine in Relationship — G.S. Youngblood

CONSCIOUSNESS & SELF-AWARENESS

The Body Keeps the Score — Bessel van der Kolk (2014)
Awareness — Anthony de Mello (1990)
Maybe You Should Talk to Someone — Lori Gottlieb (2019)
Self-Compassion — Kristin Neff (2011)
How Emotions Are Made — Lisa Feldman Barrett (2017)
The Genius of Empathy — Judith Orloff (2024)
Hope for Cynics — Jamil Zaki (2024)
Shift — Ethan Kross (2025)

=======================================================
SECTION 2: PODCASTS
=======================================================

FOR MEN SPECIFICALLY

Mindfully Masculine — Charles & Dan
Man Enough — Justin Baldoni
The Art of Manliness — Brett McKay
The New Man Podcast — Tripp Lanier
Order of Man — Ryan Michler

EQ & RELATIONSHIPS

Where Should We Begin? — Esther Perel
Pulling the Thread — Elise Loehnen
On Being — Krista Tippett
Hidden Brain — Shankar Vedantam
10% Happier — Dan Harris
On Purpose — Jay Shetty
The Overwhelmed Brain — Paul Colaianni
EQuipped Podcast
The Jordan Harbinger Show — Jordan Harbinger
Diary of a CEO — Steven Bartlett

=======================================================
SECTION 3: ONLINE COURSES
=======================================================

Daniel Goleman's Emotional Intelligence Courses
Emotional Intelligence for Leadership — Coursera
Managing Emotions in Times of Uncertainty & Stress — Yale
Build Authentic Relationships Using Emotional Intelligence — Udemy
Emotional Intelligence at Work — Udemy
Emotional Intelligence Skills — LinkedIn Learning
Foundations of Well-Being — Rick Hanson
Self-Awareness: Leading with Emotional Intelligence — Dale Carnegie
Esther Perel Sessions
Yale Science of Well-Being — Coursera

=======================================================
SECTION 4: WEBSITES & ONLINE RESOURCES
=======================================================

The Gottman Institute
Esther Perel
Terrence Real
Brené Brown
Greater Good Science Center — UC Berkeley
Positive Psychology
TalentSmartEQ
Emotician
Rick Hanson
Mindful
Psychology Today
The School of Life
A Conscious Rethink

=======================================================
SECTION 5: YOUTUBE CHANNELS
=======================================================

The School of Life
Psych2Go
Brené Brown
Jay Shetty
Impact Theory
Lewis Howes
Actualized.org
Tony Robbins
Jordan Harbinger
Mindfully Masculine

=======================================================
SECTION 6: KEY AUTHORS TO FOLLOW
=======================================================

Daniel Goleman
Brené Brown
Esther Perel
Terrence Real
John & Julie Gottman
Susan David
Marc Brackett
Kristin Neff
Marshall Rosenberg
Richard Rohr
Bessel van der Kolk

=======================================================
SECTION 7: TED TALKS
=======================================================

The Secret to Desire in a Long-Term Relationship — Esther Perel (2013)
TED: https://www.ted.com/talks/esther_perel_the_secret_to_desire_in_a_long_term_relationship

Rethinking Infidelity — Esther Perel (2015)
TED: https://www.ted.com/talks/esther_perel_rethinking_infidelity_a_talk_for_anyone_who_has_ever_loved

The Power of Vulnerability — Brené Brown (2010)
TED: https://www.ted.com/talks/brene_brown_the_power_of_vulnerability

Listening to Shame — Brené Brown (2012)
TED: https://www.ted.com/talks/brene_brown_listening_to_shame

The Gift and Power of Emotional Courage — Susan David (2017)
TED: https://www.ted.com/talks/susan_david_the_gift_and_power_of_emotional_courage

Why Aren't We More Compassionate? — Daniel Goleman (2007)
TED: https://www.ted.com/talks/daniel_goleman_why_aren_t_we_more_compassionate

What Makes a Good Life? — Robert Waldinger (2015)
TED: https://www.ted.com/talks/robert_waldinger_what_makes_a_good_life_lessons_from_the_longest_study_on_happiness

How to Make Stress Your Friend — Kelly McGonigal (2013)
TED: https://www.ted.com/talks/kelly_mcgonigal_how_to_make_stress_your_friend

All It Takes Is 10 Mindful Minutes — Andy Puddicombe (2012)
TED: https://www.ted.com/talks/andy_puddicombe_all_it_takes_is_10_mindful_minutes

=======================================================
SECTION 8: APPS FOR ONGOING PRACTICE
=======================================================

Headspace
Calm
Waking Up — Sam Harris
Gottman Card Decks
Reflectly
Day One
Notion
`;

// ── simple parser (same logic as browser app) ──────────────────
const RE_SECTION    = /^SECTION\s+\d+\s*:\s*(.+)/i;
const RE_DIVIDER    = /^[=─-]{3,}\s*$/;
const RE_SUBSECTION = /^[A-Z][A-Z0-9 ,&'''\-\/]{3,}$/;
const RE_ITEM_DASH  = /^(.+?)\s+[—–-]\s+(.+?)(?:\s*\((\d{4})\))?\s*$/;
const RE_LINK_LINE  = /^([A-Za-z][A-Za-z0-9 &'-]{1,40}?):\s*(https?:\/\/\S+)/;

let nextId = 0;
const uid  = () => `item-${++nextId}`;
const toTitleCase = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

function parse(raw) {
  const lines = raw.split(/\r?\n/);
  const sections = [];
  let curSec = null, curSub = null, curItem = null;

  const ensureSec  = n => { curSec = { name: n, subs: [], items: [] }; sections.push(curSec); curSub = null; };
  const ensureSub  = n => { if (!curSec) ensureSec('General'); curSub = { name: n, items: [] }; curSec.subs.push(curSub); };
  const pushItem   = it => { if (!curSec) ensureSec('General'); (curSub ? curSub.items : curSec.items).push(it); };
  const mkItem     = (o) => ({ id: uid(), ...o, links: [], openLibrary: null, archive: null, openAlex: null, transcript: null });

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || RE_DIVIDER.test(line)) { curItem = null; continue; }

    const mSec = line.match(RE_SECTION);
    if (mSec) { curItem = null; ensureSec(mSec[1].trim()); continue; }

    const mLink = line.match(RE_LINK_LINE);
    if (mLink && curItem) {
      curItem.links.push({ label: mLink[1].trim(), url: mLink[2] });
      continue;
    }

    if (RE_SUBSECTION.test(line) && !line.includes(':') && line.length < 60) {
      curItem = null; ensureSub(toTitleCase(line)); continue;
    }

    const mItem = line.match(RE_ITEM_DASH);
    if (mItem && curSec) {
      const it = mkItem({
        title:  mItem[1].trim(),
        author: mItem[2].trim(),
        year:   mItem[3] ? parseInt(mItem[3]) : null,
        section: curSec.name,
        subsection: curSub ? curSub.name : null,
        type: inferType(curSec.name),
      });
      pushItem(it); curItem = it; continue;
    }

    // bare title line
    if (curSec && line.length > 2) {
      const it = mkItem({ title: line, author: null, year: null, section: curSec.name, subsection: curSub?.name, type: inferType(curSec.name) });
      pushItem(it); curItem = it; continue;
    }
  }
  return sections.filter(s => s.items.length || s.subs.length);
}

function inferType(sectionName) {
  const n = (sectionName || '').toUpperCase();
  if (n.includes('BOOK')) return 'Book';
  if (n.includes('PODCAST')) return 'Podcast';
  if (n.includes('COURSE')) return 'Course';
  if (n.includes('YOUTUBE')) return 'YouTube';
  if (n.includes('AUTHOR')) return 'Author';
  if (n.includes('TED'))    return 'Talk';
  if (n.includes('APP'))    return 'App';
  if (n.includes('WEBSITE') || n.includes('RESOURCE')) return 'Website';
  return null;
}

function allItems(sections) {
  const out = [];
  for (const s of sections)  {
    out.push(...s.items);
    for (const sub of s.subs) out.push(...sub.items);
  }
  return out;
}

// ── Open Library ───────────────────────────────────────────────
async function queryOpenLibrary(item) {
  if (item.type !== 'Book') return null;
  const q = [item.title, item.author].filter(Boolean).join(' ');
  const url = `https://openlibrary.org/search.json?q=${enc(q)}&limit=3&fields=key,title,author_name,first_publish_year,ia,availability,cover_i,number_of_pages_median,subject`;
  try {
    const { data } = await get(url);
    if (!data?.docs?.length) return { found: false };
    const best = data.docs[0];
    const ia   = best.ia?.[0] ?? null;
    return {
      found:          true,
      key:            best.key,
      title:          best.title,
      authors:        best.author_name?.join(', '),
      year:           best.first_publish_year,
      pages:          best.number_of_pages_median,
      subjects:       best.subject?.slice(0, 5) ?? [],
      cover:          best.cover_i ? `https://covers.openlibrary.org/b/id/${best.cover_i}-M.jpg` : null,
      ia_identifier:  ia,
      borrow_url:     ia ? `https://archive.org/details/${ia}` : `https://openlibrary.org${best.key}`,
      availability:   best.availability?.status ?? (ia ? 'borrow' : 'catalog'),
    };
  } catch (e) {
    return { found: false, error: e.message };
  }
}

// ── Internet Archive full-text ──────────────────────────────────
async function queryArchive(item) {
  if (!['Book','Paper'].includes(item.type)) return null;
  const q = [item.title, item.author].filter(Boolean).join(' ');
  const url = `https://archive.org/advancedsearch.php?q=${enc(q)}+AND+mediatype%3Atexts&rows=3&page=1&output=json&fl[]=identifier,title,creator,year,mediatype,downloads,access-restricted-item`;
  try {
    const { data } = await get(url);
    const docs = data?.response?.docs ?? [];
    if (!docs.length) return { found: false };
    const d = docs[0];
    return {
      found:      true,
      identifier: d.identifier,
      url:        `https://archive.org/details/${d.identifier}`,
      title:      d.title,
      creator:    d.creator,
      year:       d.year,
      downloads:  d.downloads,
      access:     d['access-restricted-item'] ? 'restricted' : 'open',
    };
  } catch (e) {
    return { found: false, error: e.message };
  }
}

// ── TED transcript ──────────────────────────────────────────────
async function fetchTEDTranscript(item) {
  if (item.type !== 'Talk') return null;
  const tedLink = item.links.find(l => l.url?.includes('ted.com/talks/'));
  if (!tedLink) return null;

  const slug = tedLink.url.match(/ted\.com\/talks\/([^/?#]+)/)?.[1];
  if (!slug) return null;

  // TED's internal transcript JSON (language=en)
  const url = `https://www.ted.com/talks/${slug}/transcript.json?language=en`;
  try {
    const { data, status } = await get(url, { json: true });
    if (status !== 200 || !data?.captions) {
      // fallback: try the HTML page and strip script tags
      return await fetchTEDTranscriptHTML(slug);
    }
    const paragraphs = [];
    let current = '';
    for (const cap of data.captions) {
      current += (current ? ' ' : '') + cap.content;
      if (cap.startOfParagraph && current.trim()) {
        paragraphs.push(current.trim());
        current = '';
      }
    }
    if (current.trim()) paragraphs.push(current.trim());
    return { source: 'ted.com', slug, url: tedLink.url, paragraphs, wordCount: paragraphs.join(' ').split(/\s+/).length };
  } catch (e) {
    return { found: false, error: e.message };
  }
}

async function fetchTEDTranscriptHTML(slug) {
  const url = `https://www.ted.com/talks/${slug}/transcript`;
  try {
    const { data, status } = await get(url, { json: false });
    if (status !== 200 || !data) return null;
    // extract transcript paragraphs from HTML
    const chunks = [];
    const re = /<p[^>]*class="[^"]*talk-transcript__para__text[^"]*"[^>]*>([\s\S]*?)<\/p>/g;
    let m;
    while ((m = re.exec(data)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (text) chunks.push(text);
    }
    if (!chunks.length) {
      // try a broader scrape for any paragraph content blocks
      const re2 = /<span[^>]*class="[^"]*transcript[^"]*"[^>]*>([\s\S]*?)<\/span>/g;
      while ((m = re2.exec(data)) !== null) {
        const text = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (text.length > 60) chunks.push(text);
      }
    }
    if (!chunks.length) return { found: false, error: 'transcript not extracted from HTML' };
    return { source: 'ted.com', slug, url: `https://www.ted.com/talks/${slug}/transcript`, paragraphs: chunks, wordCount: chunks.join(' ').split(/\s+/).length };
  } catch (e) {
    return { found: false, error: e.message };
  }
}

// ── OpenAlex (academic papers / mentions) ──────────────────────
async function queryOpenAlex(item) {
  if (!['Book','Paper'].includes(item.type)) return null;
  const q = [item.title, item.author].filter(Boolean).join(' ');
  const url = `https://api.openalex.org/works?search=${enc(q)}&per-page=3&select=id,title,authorships,publication_year,open_access,primary_location`;
  try {
    const { data } = await get(url);
    const results = data?.results ?? [];
    if (!results.length) return { found: false };
    const best = results[0];
    return {
      found:       true,
      id:          best.id,
      title:       best.title,
      year:        best.publication_year,
      authors:     best.authorships?.slice(0,3).map(a => a.author?.display_name).join(', '),
      oa:          best.open_access?.is_oa,
      oa_url:      best.open_access?.oa_url,
      pdf_url:     best.primary_location?.pdf_url,
      landing:     best.primary_location?.landing_page_url,
    };
  } catch (e) {
    return { found: false, error: e.message };
  }
}

// ── main crawler ────────────────────────────────────────────────
async function main() {
  console.log('OpenBooks crawler starting…\n');
  const sections = parse(RESOURCE_LIST);
  const items    = allItems(sections);
  console.log(`Parsed: ${sections.length} sections, ${items.length} items\n`);

  const books   = items.filter(i => i.type === 'Book');
  const talks   = items.filter(i => i.type === 'Talk');
  const others  = items.filter(i => !['Book','Talk'].includes(i.type));

  console.log(`  Books: ${books.length}  |  TED Talks: ${talks.length}  |  Other: ${others.length}\n`);

  // ── BOOKS ────────────────────────────────────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('QUERYING: Open Library + Internet Archive + OpenAlex');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const book of books) {
    process.stdout.write(`  [BOOK] ${trim(book.title, 50).padEnd(52)}`);
    const [ol, ia, oa] = await Promise.all([
      queryOpenLibrary(book),
      queryArchive(book),
      queryOpenAlex(book),
    ]);
    book.openLibrary = ol;
    book.archive     = ia;
    book.openAlex    = oa;

    const flags = [
      ol?.found ? `OL:${ol.availability ?? '?'}` : 'OL:—',
      ia?.found ? `IA:${ia.access ?? '?'}` : 'IA:—',
      oa?.found && oa.oa ? 'OA:✓' : 'OA:—',
    ].join('  ');
    console.log(flags);
    await sleep(350); // be polite to APIs
  }

  // ── TED TALKS ────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('FETCHING: TED Transcripts');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const talk of talks) {
    process.stdout.write(`  [TALK] ${trim(talk.title, 50).padEnd(52)}`);
    const tr = await fetchTEDTranscript(talk);
    talk.transcript = tr;
    if (tr?.paragraphs?.length) {
      console.log(`${tr.paragraphs.length} para  ~${tr.wordCount}w`);
    } else {
      console.log(`no transcript  (${tr?.error ?? 'not found'})`);
    }
    await sleep(600);
  }

  // ── build output ─────────────────────────────────────────────
  const result = {
    meta: {
      generated:  new Date().toISOString(),
      title:      'Emotional Intelligence, Relationships & Personal Growth',
      purpose:    'Compiled resource list with open-access metadata',
      items_total: items.length,
      books_found_ol:  books.filter(b => b.openLibrary?.found).length,
      books_found_ia:  books.filter(b => b.archive?.found).length,
      talks_with_transcript: talks.filter(t => t.transcript?.paragraphs?.length > 0).length,
    },
    sections: sections.map(sec => ({
      name: sec.name,
      items: sec.items.map(clean),
      subsections: sec.subs.map(sub => ({
        name: sub.name,
        items: sub.items.map(clean),
      })),
    })),
  };

  const outPath = path.join(__dirname, 'data', 'crawl-results.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  // also write the transcripts to separate readable files
  for (const talk of talks) {
    if (talk.transcript?.paragraphs?.length) {
      const fname = (talk.transcript.slug || talk.id) + '.txt';
      const out = [
        talk.title + (talk.author ? '\n' + talk.author : '') + (talk.year ? ' (' + talk.year + ')' : ''),
        '─'.repeat(60),
        talk.transcript.paragraphs.join('\n\n'),
        '\n─'.repeat(30),
        `Source: ${talk.transcript.url}`,
        `Words: ~${talk.transcript.wordCount}`,
      ].join('\n\n');
      fs.writeFileSync(path.join(__dirname, 'data', fname), out);
    }
  }

  // ── summary ──────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total items catalogued:     ${items.length}`);
  console.log(`Books found on Open Library:  ${books.filter(b => b.openLibrary?.found).length}/${books.length}`);
  console.log(`Books found on Internet Archive: ${books.filter(b => b.archive?.found).length}/${books.length}`);
  console.log(`Books borrowable (IA/OL):   ${books.filter(b => b.archive?.found || b.openLibrary?.availability === 'borrow').length}/${books.length}`);
  console.log(`TED transcripts retrieved:  ${talks.filter(t => t.transcript?.paragraphs?.length > 0).length}/${talks.length}`);
  console.log(`\nResults saved → ${outPath}`);
}

function clean(it) {
  return {
    id:        it.id,
    title:     it.title,
    author:    it.author,
    year:      it.year,
    type:      it.type,
    section:   it.section,
    subsection:it.subsection,
    links:     it.links,
    openLibrary:  it.openLibrary,
    archive:      it.archive,
    openAlex:     it.openAlex,
    transcript:   it.transcript ? {
      source:     it.transcript.source,
      url:        it.transcript.url,
      paragraphs: it.transcript.paragraphs,
      wordCount:  it.transcript.wordCount,
    } : null,
  };
}

main().catch(e => { console.error('\nCrawler error:', e); process.exit(1); });
