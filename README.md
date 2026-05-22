<img width="971" height="769" alt="Screenshot 2026-05-22 at 9 06 50 am" src="https://github.com/user-attachments/assets/417f5244-4102-4c82-969e-06b0428b42c0" />

# blank

Collaborative thread UI with video ingest, feed intel, and kbatch-style phrase / keyboard analysis. Double-click **`Launch Blank.app`** or **`Launch.command`** to open Terminal, start the server, and open the browser.

- Keep **`Launch Blank.app`** next to **`start.sh`**. Custom Dock/Finder icon: run **`./support/macos/refresh-launcher-icon.sh`** (see [support/README.md](support/README.md)).
- App code lives in **`support/`**. Server tuning, logging, and ingest details: **[support/README.md](support/README.md)**.

**While running:** the Terminal shows a startup banner plus one line per HTTP request. **`kill -USR1 <pid>`** prints rolling stats. **Ctrl+C** stops the server.

**First launch (macOS):** if Gatekeeper blocks the app, **right-click → Open** once, or allow under **System Settings → Privacy & Security**.

---

## Prerequisites

Nothing is installed automatically when you clone or download the repo. You bring the tools below; the app checks what it can use at runtime.

| Requirement | Required for | Install / docs |
|---------------|----------------|----------------|
| **[Node.js](https://nodejs.org/)** 18+ (20+ recommended) | Local server (`node support/server.mjs`), ingest APIs | [nodejs.org](https://nodejs.org/) · macOS: `brew install node` |
| **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** | Resolve watch URLs, metadata, captions, HLS play sessions, `~/Downloads` archives | [github.com/yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp) · `brew install yt-dlp` |
| **[FFmpeg](https://ffmpeg.org/)** (`ffmpeg`, includes `ffplay` / `ffprobe`) | Scene JPEG thumbs, per-scene audio waveforms | [ffmpeg.org/download.html](https://ffmpeg.org/download.html) · `brew install ffmpeg` |
| **Modern browser** (Chrome, Firefox, Safari, Edge) | UI, canvas viz, `localStorage`, ES modules | — |
| **Terminal** (macOS Terminal, iTerm, etc.) | Launchers, copied ffplay / mustream / yt-dlp commands | — |

**Optional (not bundled; paths in the header “Path defaults” panel):**

| Tool | Role | Notes |
|------|------|--------|
| **MuStream desktop** (local checkout, optional) | `mustream` play/resolve, `open-in-mustream.sh` | Set path in UI (default `~/dev/mustream-desktop`) |
| **mueee-kbatch** (local checkout, optional) | `launch-mustream.sh` helpers | Set path in UI (default `~/dev/mueee-kbatch`) · [kbatch live demo](https://mueee.qbitos.ai/kbatch.html) |
| **`ffplay`** | Ad-free / camera preview from copied commands | From FFmpeg; macOS avfoundation device for **camera** menu |

**Not required:**

- **npm packages** — `support/package.json` has no dependencies; only `node support/server.mjs`.
- **Docker / database / API keys** — no cloud LLM or IBM Quantum wiring in this repo.
- **Build step** — no webpack/vite; static HTML/CSS/JS served as-is.

**`start.sh` / `Launch Blank.app` PATH:** `/opt/homebrew/bin`, `/usr/local/bin`, and NVM (if `~/.nvm/nvm.sh` exists) are prepended so Homebrew tools are found.

---

## What you get: download vs local run vs deploy

| What you do | What lands on disk | What runs | Ingest / “live” backend |
|-------------|-------------------|-----------|-------------------------|
| **Clone or download ZIP** | Full repo: `support/` (HTML, CSS, JS, `server.mjs`, `thread.json`, `videos.json`), `Launch Blank.app`, `start.sh`, workflows | Nothing until you start it | — |
| **`./start.sh`** or **`Launch Blank.app`** | Same files; may create **`~/Downloads/*.mkv`** (or chosen format) when you **download** a queued URL | **Node** static server on `127.0.0.1:5173` (default); browser opened to `/` | **Yes** — `/api/ingest/*` if `yt-dlp` + `ffmpeg` on PATH |
| **`npm start --prefix support`** | Same | Same as above | **Yes** |
| **`node support/server.mjs`** | Same | Same (custom `PORT`, `BLANK_*` env — see support README) | **Yes** |
| **GitHub Pages** ([workflow](.github/workflows/pages.yml)) | **Only** static files from `support/` (no `Launch Blank.app` on Pages) | GitHub-hosted static site | **No** — UI loads; intel/resolve/play return unavailable |

**Browser storage (any host):** `localStorage` keys for live thread rows, video queue, path defaults, phrase watch list — see [support/README.md](support/README.md).

**CDN (loaded by the page, not cloned):** [HLS.js 1.5.7](https://github.com/video-dev/hls.js) from jsDelivr for HLS preview when the local proxy serves playlists.

---

## Live capabilities (what updates as you work)

Capabilities are **local and deterministic** unless noted. There is **no** built-in OpenAI / Anthropic / Gemini API integration in **blank**.

### Always in the browser (static or local server)

| Feature | Behavior |
|---------|----------|
| **Thread + deliverables** | Cards from `thread.json` + live rows; prompt chips, drawer |
| **Phrase search** | Index transcript, scene lines, queue titles, thread prompts; collapsible panel |
| **Keyboard viz** | 15 layouts, contrails + geometric spirals, kbatch-style metrics (WPM, efficiency, strain, …) |
| **Cross-layout overlap %** | Layout dropdown labels from phrase/index overlap (heuristic, not an LLM) |
| **Phrase watch list** | Alerts when watched phrases appear in loaded intel |
| **Video queue UI** | Paste/queue URLs, presets, embed preview when the platform allows |
| **Terminal command menus** | Copy yt-dlp / mustream / ffprobe / ffplay lines (**you** run them in Terminal) |
| **Per-caption “AI note” fields** | Manual notes on scene cards (saved in the DOM session only, not cloud AI) |

### Needs local server (`./start.sh`) + `yt-dlp`

| API / feature | Endpoint or trigger |
|---------------|---------------------|
| **Stream resolve + header preview** | `POST /api/ingest/resolve` → `GET /api/ingest/play/:id` (HLS or direct; may use `/api/ingest/proxy`) |
| **Archive download** | `POST /api/ingest/download` or resolve with `download: true` → **yt-dlp** → `~/Downloads` |
| **Program intel** | `POST /api/ingest/intel` — title, description, chapters/scenes, WebVTT captions |
| **Scene thumbnails** | `GET /api/ingest/scene-thumb?url=&t=` |
| **Scene waveform audio** | `GET /api/ingest/scene-audio?url=&t=&dur=` |
| **Pose estimate thumb** | `GET /api/ingest/pose-thumb?url=&t=` (SVG / seeded estimate) |
| **Analysis strip thumbs** | `GET /api/ingest/scene-analysis-thumb?url=&t=&kind=` (`sam`, `alpha`, `watermark`, `vectorscope` — styled SVG previews) |

### Needs local server + `ffmpeg`

| Feature | Tool |
|---------|------|
| Scene frame capture for thumbs / audio | `ffmpeg` (spawned from `video-intel.mjs`) |

### Needs local server + browser

| Feature | Behavior |
|---------|----------|
| **IK overlay on scene stills** | Lightweight client-side joint estimate from loaded frame image |
| **Scene “camera / shot” lines** | Heuristic text from captions + metadata (not a vision model API) |

### GitHub Pages only

| Works | Does not work |
|-------|----------------|
| UI, thread JSON fetch, phrase UI shell, embeds for allowed hosts | `/api/ingest/*`, yt-dlp resolve, intel, scene thumbs, waves, downloads |

Related full analyzer (contrails tab, IBM Quantum, dictionary, etc.): **[mueee.qbitos.ai/kbatch.html](https://mueee.qbitos.ai/kbatch.html)** — separate project; **blank** reuses the ingest + keyboard metrics pattern, not the whole kbatch stack.

---

## Quick start (local, full features)

```bash
# Prerequisites on PATH: node, yt-dlp, ffmpeg
cd /path/to/blank
./start.sh
# → http://127.0.0.1:5173/
```

Optional: queue from URL bar — `http://127.0.0.1:5173/?url=https://www.youtube.com/watch?v=…` (auto resolve + intel when the server is up).

---

## GitHub Pages

Static UI deploys from **`support/`** on every push to **`main`** via [`.github/workflows/pages.yml`](.github/workflows/pages.yml).

1. [github.com/fornevercollective/blank/settings/pages](https://github.com/fornevercollective/blank/settings/pages) → **Build and deployment → Source: GitHub Actions**
2. Site: **https://fornevercollective.github.io/blank/**

Pages is **UI-only**. Run **`./start.sh`** locally for ingest, preview proxy, and scene intel.

---

## Repo map

| Path | Purpose |
|------|---------|
| `support/` | Web root: `index.html`, `app.js`, ingest, intel, phrase keyboard |
| `support/server.mjs` | Static file server + ingest API router |
| `support/thread.json` | Built-in deliverable cards (refreshed on reload) |
| `support/videos.json` | Sample streams + ffplay presets |
| `start.sh` | Launcher script (PATH + browser) |
| `Launch Blank.app` | macOS double-click launcher |
| `.github/workflows/pages.yml` | GitHub Pages deploy |

---

## License

See [LICENSE](LICENSE).
