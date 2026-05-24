# blank

Download · launch terminal · run:

```bash
cd '/path/to/blank' && exec ./start.sh
```

Built for live develop-and-iterate workflows while a terminal AI CLI is running.

<img width="971" height="769" alt="Screenshot 2026-05-22 at 9 06 50 am" src="https://github.com/user-attachments/assets/417f5244-4102-4c82-969e-06b0428b42c0" />

<img width="1178" height="852" alt="Screenshot 2026-05-22 at 9 49 11 am" src="https://github.com/user-attachments/assets/06a3f7f2-2f23-4c5d-8c1d-1fb72e9ec4a8" />

## Captions / transcript search

Phrase search across queued video captions; scene-linked intel and keyboard shadow paths in the feed.

<img width="1185" height="857" alt="Screenshot 2026-05-24 at 10 56 45 am" src="https://github.com/user-attachments/assets/e2112e9c-94eb-4539-ace2-a2e6b0f95fad" />

## Keyboard layouts

Multi-layout spiral and key-position coverage in phrase search.

<img width="1185" height="857" alt="Screenshot 2026-05-24 at 10 57 29 am" src="https://github.com/user-attachments/assets/c4d740ef-dd8a-48a1-9cf8-45c7a61e5f8a" />

<img width="1185" height="857" alt="Screenshot 2026-05-24 at 10 57 07 am" src="https://github.com/user-attachments/assets/5c847542-ce6e-49e4-a9ef-9dadf4c3b18e" />

## Scene intel

Waveforms, scrubbing, IK pose estimates, and camera-axis telemetry on scene cards.

<img width="1185" height="857" alt="Screenshot 2026-05-24 at 10 46 38 am" src="https://github.com/user-attachments/assets/d520c8ef-8c77-4b15-8f4f-f7e61b17f1fa" />

<img width="1185" height="857" alt="Screenshot 2026-05-24 at 10 30 53 am" src="https://github.com/user-attachments/assets/ed451e83-f893-4cb8-af41-880073d844cb" />

<img width="1185" height="857" alt="Screenshot 2026-05-24 at 10 33 01 am" src="https://github.com/user-attachments/assets/f573655b-bded-407f-bfa4-e5cbd7fa0857" />

## Run locally

Double-click **`Launch Blank.app`** or **`Launch.command`** in this folder to open Terminal, start the server, and open your browser.

- Keep **`Launch Blank.app`** here (next to **`start.sh`**). It uses your **favicon** as the Finder/Dock icon after you run **`./support/macos/refresh-launcher-icon.sh`** (see **[support/README.md](support/README.md)**).
- Server, HTML, and package manifest are in **`support/`**. See **[support/README.md](support/README.md)** for `npm`, **per-request logging**, **network/tuning env vars**, rebuilding the app, and **video ingest** (queue, embeds, yt-dlp/mustream commands — same pattern as `mueee-kbatch/video-ingest-hub`).

**While it’s running,** the Terminal shows a startup banner plus one line per HTTP hit. Send **`SIGUSR1`** to that process (e.g. `kill -USR1 <pid>`) to print rolling stats.

**Stop the server:** **Ctrl+C** in the Terminal window that opened.

**First launch (macOS):** If the app is blocked, **right-click → Open** once, or allow it under **System Settings → Privacy & Security**.

## GitHub Pages

Static UI is deployed from **`support/`** on every push to **`main`** via [`.github/workflows/pages.yml`](.github/workflows/pages.yml).

1. In [github.com/fornevercollective/blank/settings/pages](https://github.com/fornevercollective/blank/settings/pages), set **Build and deployment → Source** to **GitHub Actions**.
2. After the workflow succeeds, the site is at **https://fornevercollective.github.io/blank/**

**Note:** Pages serves the front end plus a **pre-cached** YouTube demo (`SKia5QUiGkE` — scenes, captions, thumbnails). Other ingest APIs (`/api/ingest/*`, live yt-dlp preview, gsplat PLY export) need the local server (`./start.sh` or `node support/server.mjs`). Rebuild cache:

```bash
node support/scripts/build-pages-cache.mjs "https://www.youtube.com/watch?v=SKia5QUiGkE"
```

See **support/README.md** → *Scene intel → gsplat export*.
