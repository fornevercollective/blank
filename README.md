# blank

Double-click **`Launch Blank.app`** or **`Launch.command`** in this folder to open Terminal, start the server, and open your browser.

- Keep **`Launch Blank.app`** here (next to **`start.sh`**). It uses your **favicon** as the Finder/Dock icon after you run **`./support/macos/refresh-launcher-icon.sh`** (see **support/README.md**).
- Server, HTML, and package manifest are in **`support/`**. See **[support/README.md](support/README.md)** for `npm`, **per-request logging**, **network/tuning env vars**, rebuilding the app, and **video ingest** (queue, embeds, yt-dlp/mustream commands — same pattern as `mueee-kbatch/video-ingest-hub`).

**While it’s running,** the Terminal shows a startup banner plus one line per HTTP hit. Send **`SIGUSR1`** to that process (e.g. `kill -USR1 <pid>`) to print rolling stats.

**Stop the server:** **Ctrl+C** in the Terminal window that opened.

**First launch (macOS):** If the app is blocked, **right-click → Open** once, or allow it under **System Settings → Privacy & Security**.
