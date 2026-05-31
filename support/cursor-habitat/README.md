# blank-cursor-habitat _(blank-??? · habitat / recipes ◌)_

Blank’s **GitHub Pages** UI is intentionally empty on purpose. This folder is intentionally **not**:

a tiny **[Cursor SDK](https://cursor.com/docs/sdk/typescript)** loop that behaves like Blank grew a shell, read `mustream recipes`, and started making jokes.

## macOS Terminal.app _(Finder parity with `Launch.command`)_

At the Blank repo root, double-click **`Launch-Habitat.command`** — same “open Terminal here” pattern as **`Launch.command`**.

- Runs **`launch-habitat-terminal.sh`**: Homebrew **`PATH`**, optional **`nvm`** load (same spirit as **`start.sh`**), **`npm install`** if needed.
- **`BLANK_HABITAT_CWD`** defaults to **`$HOME/dev/mustream-desktop`** when present; otherwise the Blank repo becomes the Cursor agent cwd.

**Dock icon bundle** _(optional, like **Launch Blank.app**)_:

```bash
cd /path/to/blank
osacompile -o "Launch Habitat.app" "support/Launch Habitat.applescript"
```

## Setup _(manual Terminal)_

```bash
cd "$(git rev-parse --show-toplevel 2>/dev/null)/support/cursor-habitat" || cd ./support/cursor-habitat

npm install
export CURSOR_API_KEY="cursor_…"    # Dashboard → Integrations or team service account
```

## Run — REPL _(default persona “pact”)_

```bash
npm run habitat
```

First turn is a bootstrap message so listings show the agent titled **`blank-??? · habitat/recipes ◌`**
(and the model adopts the yt-dlp / **MuStream** recipe habits in `src/prompts.mjs`).

`/quit` leaves the habitat.

### Aim the agent at **`mustream-desktop`**

Point `--cwd` (or `$BLANK_HABITAT_CWD`) at a checkout so patches / file ops line up:

```bash
npm run habitat -- --cwd ~/dev/mustream-desktop
```

### One-shot _(`Agent.prompt`)_

```bash
npm run habitat -- --cwd ~/dev/mustream-desktop --one-shot "$(printf 'Video URL: https://youtube.com/watch?v=… Give me mustream + yt-dlp + ffprobe snippets.')"
```

You can omit `--one-shot` and pass only a quoted paragraph — same effect.

### Resume a prior **`agent-*`** conversation

Find the **`agentId`** printed on stderr, then:

```bash
npm run habitat -- --resume agent-…………
```

## Env knobs

| Var | Meaning |
|-----|---------|
| `BLANK_AGENT_NAME` | Overrides the friendly title in Agent list |
| `BLANK_HABITAT_CWD` | Default cwd if `--cwd` omitted |
| `CURSOR_AGENT_MODEL` | Override `composer-2.5` |

## Safety / billing notes

Runs bill like IDE agents (see Cursor dashboard). **`settingSources`** stay empty —
no stealth-loading your personal Cursor prefs into headless workflows.

Haiku-sized summary: **_Blank renders nothing; Habitat renders `mustream recipes`_.**
