# 📚 OpenBooks

**Multi-source open book & paper finder** — search 12+ sources, batch-parse resource lists, and generate book-like PDF readers.

![Dark UI](https://img.shields.io/badge/theme-dark-0e0e10?style=flat-square)
![PWA Ready](https://img.shields.io/badge/PWA-ready-b8f000?style=flat-square)
![Node 16+](https://img.shields.io/badge/node-%3E%3D16-339933?style=flat-square&logo=node.js&logoColor=white)
![License MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

---

## Features

- **12+ Search Sources** — Library Genesis, Sci-Hub, Anna's Archive, Open Library, Internet Archive, OpenAlex, Google Scholar, Semantic Scholar, CORE, DOAB, Unpaywall, CrossRef
- **Smart Batch Parser** — Paste entire resource lists; auto-detects titles, DOIs, ISBNs, arXiv IDs, sections, and subsections
- **Structured Results** — Results grouped by section/subsection matching your original list
- **Book Reader Overlay** — Full-screen Lora-serif reader with drop caps, pullquotes, dark/light toggle, and chapter navigation
- **PDF Generation** — Print any reader view as a beautifully formatted A5 PDF
- **Resource Crawler** — Node.js crawler fetches Open Library metadata, Internet Archive links, OpenAlex records, and TED transcripts
- **PWA / Mobile** — Installable as a home-screen app on iOS, Android, and macOS
- **Fully Offline-Capable** — Service worker caches the app and dataset for offline use
- **Self-Contained** — Single HTML file with all CSS and JS inline (no build step)

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) v16 or later

### Install & Run

```bash
# Clone the repository
git clone https://github.com/refinalophaina-jpg/openbooks.git
cd openbooks

# Start the server (opens browser automatically)
npm start -- --open

# Or use the CLI
node cli.js
```

The app will be available at **http://localhost:8080**.

### Run the Crawler

Populate the dataset with real Open Library / Internet Archive / OpenAlex metadata:

```bash
npm run crawl
# or
node crawl.js
```

The crawler:
- Queries Open Library for book metadata and cover images
- Searches Internet Archive for downloadable copies
- Fetches OpenAlex records for academic papers
- Downloads TED talk transcripts
- Saves everything to `data/crawl-results.json`

After crawling, hard-refresh the browser (`Cmd+Shift+R`) to load the enriched data.

---

## Mirror Daemon (self-healing download links)

LibGen and Anna's Archive domains rotate and go down constantly. The mirror
daemon probes a list of candidate domains and keeps a live list in
`data/mirrors.json`, so the crawler always uses a working domain.

### One-shot check

```bash
npm run mirrors
# or
node mirrors.js
```

Prints a reachability report and writes `data/mirrors.json`. The crawler
reads this file automatically (and refreshes it itself if older than 24h).

### Run as a daemon

```bash
npm run mirror-daemon            # checks every 6 hours, runs until Ctrl+C
node mirror-daemon.js --interval 1   # every 1 hour
node mirror-daemon.js --once         # single check then exit (for cron)
```

### Schedule with cron (Linux/macOS)

Run a check every 6 hours. Edit your crontab with `crontab -e` and add:

```cron
0 */6 * * * cd /path/to/openbooks && /usr/bin/env node mirror-daemon.js --once >> data/mirror.log 2>&1
```

### Schedule with launchd (macOS, recommended)

Create `~/Library/LaunchAgents/com.openbooks.mirrors.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>              <string>com.openbooks.mirrors</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>node</string>
    <string>/ABSOLUTE/PATH/TO/openbooks/mirror-daemon.js</string>
    <string>--once</string>
  </array>
  <key>StartInterval</key>      <integer>21600</integer>  <!-- 6 hours -->
  <key>WorkingDirectory</key>   <string>/ABSOLUTE/PATH/TO/openbooks</string>
  <key>StandardOutPath</key>    <string>/ABSOLUTE/PATH/TO/openbooks/data/mirror.log</string>
  <key>StandardErrorPath</key>  <string>/ABSOLUTE/PATH/TO/openbooks/data/mirror.log</string>
</dict>
</plist>
```

Then load it:

```bash
launchctl load ~/Library/LaunchAgents/com.openbooks.mirrors.plist
```

`data/mirrors.json` is machine-specific (gitignored) — each machine keeps its
own live list.

---

## Usage

### Single Search

Type a title, author, DOI, or ISBN into the search bar. Select which sources to search using the pill toggles.

### Batch Mode

1. Click the **Batch** tab
2. Paste a structured resource list (titles, DOIs, ISBNs — one per line)
3. The parser auto-detects sections, subsections, and item types
4. Click **Search All** to search every item across all enabled sources
5. Results are organized matching your original list structure

### Book Reader

After batch results load, click **📕 Build Book PDF** to generate a reader view with:
- Chapter navigation and progress bar
- Lora serif typography with drop caps
- Dark/light mode toggle
- Font size adjustment (A−/A+)
- Print to A5 PDF via `Save PDF` button

---

## Install as App

### iOS (Safari)

1. Open `http://localhost:8080` in Safari
2. Tap the **Share** button → **Add to Home Screen**
3. The app runs fullscreen with its own icon

### macOS (Chrome/Edge)

1. Open `http://localhost:8080` in Chrome or Edge
2. Click the install icon in the address bar
3. The app runs as a standalone window

### macOS (Safari)

1. Open `http://localhost:8080` in Safari
2. Go to **File → Add to Dock**

---

## Project Structure

```
openbooks/
├── index.html              # Main app (self-contained HTML/CSS/JS)
├── server.js               # Node.js HTTP server
├── cli.js                  # CLI entry point
├── crawl.js                # Resource crawler (Open Library, IA, OpenAlex, LibGen, TED)
├── mirrors.js              # Mirror registry + probe (LibGen / Anna's Archive)
├── mirror-daemon.js        # Background daemon that keeps mirrors.json fresh
├── sw.js                   # Service worker for offline/PWA support
├── manifest.webmanifest    # PWA manifest
├── package.json            # npm project config
├── icons/
│   ├── icon-192.svg        # App icon (192×192)
│   └── icon-512.svg        # App icon (512×512)
└── data/
    ├── crawl-results.json  # Crawled resource dataset (102 items)
    ├── mirrors.json         # Live mirror list (gitignored, per-machine)
    └── eq-complete-book.html  # Pre-built book reader (standalone)
```

---

## CLI Reference

```
openbooks              Start server and open browser
openbooks serve        Start server only (no auto-open)
openbooks crawl        Run the resource crawler
openbooks help         Show help

Options:
  --port <n>           Set server port (default: 8080)
```

---

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT`              | `8080`  | HTTP server port |

---

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS (no frameworks, no build step)
- **Fonts**: Syne (UI), JetBrains Mono (code), Lora (reader)
- **Server**: Node.js `http` module
- **Crawler**: Node.js `https`/`http` modules (zero dependencies)
- **PWA**: Web App Manifest + Service Worker

**Zero npm dependencies** — the entire project runs on Node.js built-in modules only.

---

## License

MIT
