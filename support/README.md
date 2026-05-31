# blank (server + page)

Static **index.html** and **server.mjs** live here. The web root for the server is this directory.

**Prerequisites, download vs deploy, and live capability matrix:** see **[../README.md](../README.md)** (root).

**Run from project root:**

```bash
cd /Users/qbit/dev/blank
npm start --prefix support
```

Or from this folder:

```bash
cd support
npm start
```

Open **http://127.0.0.1:5173/** (or the URL printed).

**Version hub:** **http://127.0.0.1:5173/versions/** — git-graph staging, npm/automation/artifact/plugin handlers, release bump plans. API: `GET /api/version/snapshot?kind=all`, `GET /api/version/plan?bump=patch`. Also link in the workspace header (**· versions**).

**Custom port:** `PORT=8080 npm start` (from `support/` or with `--prefix support` from the project root).

No npm dependencies—**server.mjs** is plain Node.

---

### Optional: **Cursor SDK** · `support/cursor-habitat/`

Terminal **“blank-??? · habitat/recipes”** agent (uses `@cursor/sdk` + `CURSOR_API_KEY`). For MuStream ingest parity without copy-pasting ten shells into [Blank](https://fornevercollective.github.io/blank/). Docs: **`cursor-habitat/README.md`**.

Finder: **`../Launch-Habitat.command`** (Blank repo root) → Terminal.app runs **`cursor-habitat/launch-habitat-terminal.sh`** _(Homebrew/`nvm` PATH, npm ensure)_.

**StageForge:** **`../Launch-StageForge.command`** runs `stageforge up` with **`../stageforge.yaml`** (loop deploy + version hub TUI). Build CLI: `make -C ~/dev/stageforge build`.


## Terminal output & networking (busy localhost)

The dev server prints a **startup banner** (listen URL, doc root, Node version, pid, **caps**, **timeouts**) and a **line per request** (time, method, path, status, duration, approx bytes, client address). **`SIGUSR1`** dumps aggregate stats (same terminal): request count, bytes served, in-flight requests, busy-rejects, TCP opens.

To reduce contention when lots of other local servers are running, you can **tune** (environment variables; defaults are conservative for a static dev server):

| Variable | Default | Purpose |
|----------|---------|--------|
| `BLANK_HOST` | `127.0.0.1` | Bind only on loopback (avoids LAN-facing listeners). |
| `BLANK_MAX_CONNECTIONS` | `128` | Cap simultaneous TCP connections on this process (Node `server.maxConnections`). |
| `BLANK_MAX_CONCURRENT` | `24` | Max in-flight HTTP handlers; extra requests get **503** + `Retry-After` instead of piling work on the event loop. |
| `BLANK_KEEP_ALIVE_MS` | `5000` | Shorter HTTP keep-alive so idle sockets free faster vs Node’s long defaults. |
| `BLANK_HEADERS_TIMEOUT_MS` | `15000` | Abandoned / slow header sends. |
| `BLANK_REQUEST_TIMEOUT_MS` | `30000` | Whole-request timeout (where supported by your Node version). |
| `BLANK_INGEST_TIMEOUT_MS` | `600000` | Long ingest routes (intel, gsplat, ffmpeg thumbs). |
| `BLANK_FFMPEG_CONCURRENCY` | `2` | Parallel ffmpeg cap in `video-intel.mjs` (set in env before start). |
| `BLANK_QUIET=1` | off | Shorter banner (request lines still print). |
| `BLANK_LOG_CONNECTIONS=1` | off | Log every TCP connect/disconnect (verbose). |

Example lighter profile when many stacks are open:

```bash
cd /Users/qbit/dev/blank
BLANK_MAX_CONNECTIONS=48 BLANK_MAX_CONCURRENT=6 BLANK_KEEP_ALIVE_MS=3000 PORT=5173 node support/server.mjs
```

Or `./start.sh` with the same variables exported before the command.

---

## Thread data (refresh = latest file + saved menu)

- **`thread.json`** — edit this file to change the built-in rows (`id` values `core-*`). Each **refresh** fetches it again with **`cache: no-store`**, so updates show up without a rebuild.
- **Browser `localStorage`** (`blank.collab.live.v1`) stores **`live: true`** rows you add at runtime and the **selected chip index**, so the top menu / drawer stay in sync after reload.
- **Built-ins** always come from `thread.json` on load (same `id` = file wins). **Live-only** rows (ids not in the file) are kept from storage.
- From the devtools console you can add a durable row, then refresh:

```js
blankAddLiveMessage({
  prompt: "Ship the API draft",
  title: "API draft",
  bodyHtml: "<p>Done.</p>",
});
```

Clear saved menu state (live rows + selection): Application → Local Storage → remove `blank.collab.live.v1`.

## Video ingest

Same idea as **`mueee-kbatch/video-ingest-hub`**: paste or queue http(s) URLs, presets from **`videos.json`**, previews in the header when embeddable (YouTube, Vimeo, HLS, direct file).

- **`video-ingest.js`** — classify URLs, embeds, `commandsFor()` (yt-dlp, mustream, ffprobe, ffplay, open-in-mustream, launch-mustream.sh).
- **`ytdlp-api.mjs`** + **`POST /api/ingest/resolve`** — on paste/queue for TikTok/watch pages: **yt-dlp** resolves HLS, header preview plays via **`/api/ingest/play/:id`**, MKV archive starts in **`~/Downloads`**.
- **`blank.videoIngest.queue.v1`** — queued rows (max 24).
- **`blank.videoIngest.paths.v1`** — MuStream desktop + mueee-kbatch paths for command substitution.
- Paste uses **MuStream-style URL pick** (embedded links, quotes, trailing punctuation stripped). **TikTok** `/@user/live` → title **`@user · live`**, tracking query params removed.
- Single **header bar** (Add / Paste / Clear) for prompts and video URLs — **`mustream:https://…`** and messy paste supported.
- **camera** — menu of local `ffplay` avfoundation commands (no embed ads).
- **feed** — menu of ad-free sample `ffplay` streams from `videos.json` + active queue; **double-click** queues the default HLS preset.
- **controls** — full menu: **Play without embed ads** (mustream, yt-dlp→ffplay pipe, direct ffplay) then archive/probe rows.
- **copy links** (header) / **Resolved links** (per queue row) — after resolve, copy **page URL**, **proxied play** (`/api/ingest/play/:id` for browser/HLS.js), and **CDN stream** (raw yt-dlp URL for ffplay/VLC).

### Scene intel → gsplat export

After queuing a URL, open **IA +** and use **Point cloud → gsplat → Build export bundle**. The server:

1. Pulls scene cuts + optional per-scene JPEG samples (ffmpeg).
2. Estimates scattered camera poses (WH lawn ENU anchor + caption/geo hints).
3. Merges lawn/facade priors with frame-edge samples into a voxel-downsampled **PLY**.
4. Writes **transforms.json** / **cameras.json** (nerfstudio-style) for local training.

API (local server only):

- `POST /api/ingest/gsplat/build` — `{ "url": "…", "useFrames": true }`
- `GET /api/ingest/gsplat/pointcloud.ply?url=…`
- `GET /api/ingest/gsplat/transforms.json?url=…`

Export each scene still into `frames/00001.jpg` (scene-thumb URLs or ffmpeg), then run the printed **gsplat** or **ns-train splatfacto** command. This is sparse scatter reconstruction, not full COLMAP/SfM in-repo.

### SuperSplat ([playcanvas/supersplat](https://github.com/playcanvas/supersplat))

SuperSplat is the **editor/viewer for trained Gaussian splats**, not a trainer. Blank does not embed SuperSplat; the handoff is:

| Step | Tool | File |
|------|------|------|
| 1. Export kit | blank IA+ or CLI | `pointcloud.ply` (sparse init), `transforms.json`, `frames/*.jpg` |
| 2. Train | nerfstudio `splatfacto` or [gsplat](https://github.com/nerfstudio-project/gsplat) | `outputs/…/point_cloud.ply` |
| 3. Edit / publish | [SuperSplat editor](https://supersplat.at/editor) | trained `.ply` → export `.sog` / `.compressed.ply` |

**Do not** drag blank’s `pointcloud.ply` into SuperSplat — it only has `x,y,z,r,g,b` vertices, not Gaussian scale/rotation/opacity.

One-shot folder export (server must be running):

```bash
node support/scripts/gsplat-export-kit.mjs "https://www.youtube.com/watch?v=…" --out ./gsplat-export
```

Then follow `gsplat-export/SUPERSPLAT.md`.

## ffplay (header preview)

The right-hand preview shows the **active queue** item. **TikTok / watch pages** auto-resolve with **yt-dlp** (needs `yt-dlp` on PATH; restart `./start.sh` after updates). Use **controls** for fallback Terminal commands.

Rebuild **Launch Blank.app** (in the parent folder) after editing the copy of the AppleScript here:

```bash
cd /Users/qbit/dev/blank
osacompile -o "Launch Blank.app" "support/Launch Blank.applescript"
./support/macos/refresh-launcher-icon.sh
```

The second line rebuilds **`blank.icns`** from **`support/favicon.ico`** and copies it to **`Launch Blank.app/Contents/Resources/applet.icns`**. It also renames **`Assets.car`** to **`Assets.car.stock`** once (Script Editor’s catalog can hide a custom **`applet.icns`**); if anything looks wrong, rename **`Assets.car.stock`** back to **`Assets.car`**.

If you change the favicon, run the script again (or only the script if the `.app` bundle already exists).

**`Launch.command`** still uses Terminal’s default icon (macOS doesn’t bundle icons in `.command` files the same way). Use **Launch Blank.app** for the branded launcher.

The project’s main readme is **../README.md** (launchers live next to it).
