const SOURCES = [
  'LibGen', 'Sci-Hub', 'OpenAlex', 'Semantic Scholar',
  'arXiv', 'PubMed', 'DOAJ', 'Project Gutenberg',
  'Internet Archive', 'Open Library', 'CORE', 'Unpaywall',
];

const FORMATS = ['PDF', 'EPUB', 'DJVU', 'MOBI', 'HTML'];

const activeSources = new Set(SOURCES);
const activeFormats = new Set();

function initPills() {
  const srcRow = document.getElementById('src-row');
  SOURCES.forEach(src => {
    const btn = document.createElement('button');
    btn.className = 'spill on';
    btn.textContent = src;
    btn.addEventListener('click', () => {
      if (activeSources.has(src)) {
        activeSources.delete(src);
        btn.classList.remove('on');
      } else {
        activeSources.add(src);
        btn.classList.add('on');
      }
    });
    srcRow.appendChild(btn);
  });

  const fmtRow = document.getElementById('fmt-row');
  FORMATS.forEach(fmt => {
    const btn = document.createElement('button');
    btn.className = 'spill';
    btn.textContent = fmt;
    btn.addEventListener('click', () => {
      if (activeFormats.has(fmt)) {
        activeFormats.delete(fmt);
        btn.classList.remove('on');
      } else {
        activeFormats.add(fmt);
        btn.classList.add('on');
      }
    });
    fmtRow.appendChild(btn);
  });
}

function doSearch() {
  const q = document.getElementById('q').value.trim();
  if (!q) return;

  const btn = document.getElementById('btn-go');
  btn.disabled = true;

  const results = document.getElementById('results');
  results.innerHTML = '<div class="empty">Searching across ' + activeSources.size + ' sources…</div>';

  // placeholder — wire real API calls here
  setTimeout(() => {
    btn.disabled = false;
    renderResults(q);
  }, 800);
}

function renderResults(q) {
  const results = document.getElementById('results');
  const srcs = [...activeSources];

  if (!srcs.length) {
    results.innerHTML = '<div class="empty">No sources selected.</div>';
    return;
  }

  // demo items — replace with real fetch results
  const demo = srcs.slice(0, 6).map((src, i) => ({
    title: `"${q}" — result ${i + 1}`,
    meta: `${src} · ${2018 + i} · PDF`,
    source: src,
  }));

  results.innerHTML = demo.map(r => `
    <div class="result-item">
      <div class="ri-body">
        <div class="ri-title">${esc(r.title)}</div>
        <div class="ri-meta">${esc(r.meta)}</div>
      </div>
      <span class="ri-src">${esc(r.source)}</span>
    </div>
  `).join('');
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.getElementById('q').addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch();
});

initPills();
