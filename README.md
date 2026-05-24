# blank
Download.. 
Launch terminal.. 
RUN.. 
- cd '/Users/???/???/blank/' && exec ./start.sh
______
built for live develop and iteration workflows while terminal AI cli is running
______
<img width="971" height="769" alt="Screenshot 2026-05-22 at 9 06 50 am" src="https://github.com/user-attachments/assets/417f5244-4102-4c82-969e-06b0428b42c0" />
<img width="1178" height="852" alt="Screenshot 2026-05-22 at 9 49 11 am" src="https://github.com/user-attachments/assets/06a3f7f2-2f23-4c5d-8c1d-1fb72e9ec4a8" />


Double-click **`Launch Blank.app`** or **`Launch.command`** in this folder to open Terminal, start the server, and open your browser.

- Keep **`Launch Blank.app`** here (next to **`start.sh`**). It uses your **favicon** as the Finder/Dock icon after you run **`./support/macos/refresh-launcher-icon.sh`** (see **support/README.md**).
- Server, HTML, and package manifest are in **`support/`**. See **[support/README.md](support/README.md)** for `npm`, **per-request logging**, **network/tuning env vars**, rebuilding the app, and **video ingest** (queue, embeds, yt-dlp/mustream commands — same pattern as `mueee-kbatch/video-ingest-hub`).

**While it’s running,** the Terminal shows a startup banner plus one line per HTTP hit. Send **`SIGUSR1`** to that process (e.g. `kill -USR1 <pid>`) to print rolling stats.

**Stop the server:** **Ctrl+C** in the Terminal window that opened.

**First launch (macOS):** If the app is blocked, **right-click → Open** once, or allow it under **System Settings → Privacy & Security**.

## GitHub Pages

Static UI is deployed from **`support/`** on every push to **`main`** via [`.github/workflows/pages.yml`](.github/workflows/pages.yml).

1. In [github.com/fornevercollective/blank/settings/pages](https://github.com/fornevercollective/blank/settings/pages), set **Build and deployment → Source** to **GitHub Actions**.
2. After the workflow succeeds, the site is at **https://fornevercollective.github.io/blank/**

**Note:** Pages serves the front end plus a **pre-cached** SpaceX YouTube demo (`SKia5QUiGkE` — scenes, captions, thumbnails). Other ingest APIs (`/api/ingest/*`, live yt-dlp preview, gsplat PLY export) need the local server (`./start.sh` or `node support/server.mjs`). Rebuild cache: `node support/scripts/build-pages-cache.mjs`. See **support/README.md** → *Scene intel → gsplat export*.