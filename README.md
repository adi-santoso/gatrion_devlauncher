# DevLauncher

> **English** | [Bahasa Indonesia](README.id.md)

DevLauncher is a desktop app for keeping all your development projects in one place. Register a project, start and stop it, watch its logs, run git commands, manage dependencies, and open its preview — all from a single window. It works with Laravel, Next.js, React/Vite, Vue, Go, Node.js, and anything with a custom start command.

Status: **in development — not production-ready yet**. See [Feature Status](docs/FEATURE_STATUS.md) for per-feature status and the [Changelog](CHANGELOG.md) for the full history.

## Features

### Project management
- **Register any folder as a project** — the framework is auto-detected (Laravel, Next.js, React/Vite, Vue, Go, Node.js, or Custom) along with its start command and port. Every project can define its own start commands, environment variables, and tags.
- **Full CRUD** — edit, duplicate, or delete projects; drag & drop a folder onto the window to auto-fill the form. Export/import projects as portable JSON (import merges without overwriting duplicates).
- **Workspace presets** — save a group of projects as a preset and start/stop the whole stack with one click, with staggered start delays and per-project progress.

### Process control
- **Start / stop / restart** individual projects or all at once (`Start All` / `Stop All`), with visible status transitions (Starting → Running → Stopping → Stopped) and PID tracking.
- **Auto-restart** crashed projects with exponential backoff and configurable retries/delay; a smart restart waits for the old port to free up first.
- **Dependency ordering** — projects can declare `dependsOn`, and Start All respects the topological order; port conflicts are detected before starting.
- **Monitoring** — CPU/RAM sampled every 4 seconds with a 30-point history and sparklines on the dashboard; crashes are detected on non-zero exit.
- **Notifications** — native Windows notifications with action buttons (Restart on crash, Restart & install when an update is ready).

### Logs & terminal
- **Live logs** — stdout/stderr stream in real time per project, with search, highlight, and type filters (stdout/stderr/error/warn/system). Very long logs are virtualized so thousands of lines scroll smoothly.
- **Interactive terminal** — open a real PTY shell per project directly inside the app.
- **Main log** — the main-process log is rotated automatically and can be tailed from Settings.

### Project Detail
- **Git tab** — status, stage/unstage, commit, log, diff, checkout branch, pull/push, stash, discard changes, and blame.
- **Dependencies tab** — `npm outdated` in a table (current/wanted/latest), update one package or all at once with automatic backup of `package.json` and the lockfile.
- **Environment tab** — view/edit `.env` files with quick profile switching (base/dev/staging/production) and masked secrets (KEY/TOKEN/SECRET/PASSWORD).
- **Analytics tab** — crash history, run history with uptime, total runs/uptime, daily CPU/memory trends.
- **Script runner** — run any `package.json` script with a health check.
- **App preview** — the running app opens in an embedded native view (WebContentsView) with persistent per-project sessions (cookies/storage survive), plus a focus mode with DevTools.

### AI coding agent (oh-my-pi)
- **Streaming chat per project** over omp's RPC protocol — text, thinking, and tool cards stream in real time.
- **Sessions** grouped per project: create, rename, delete, pin, search, export to Markdown, branch from any message, run bash commands, and per-session drafts.
- **Cost tracking** — token usage per turn and per session, with cost estimation per model.
- **Built-in installer** — downloads the omp binary (SHA256-verified, no admin rights) and lets you configure providers from Settings, or picks up an existing install from PATH.

### Workspace-wide
- **Command palette** (`Ctrl+K`) — jump to projects, agent sessions, files (workspace file search with highlighting), and built-in commands.
- **Dashboard** — live status overview, workspace presets, group-by-tag, live activity feed, and recent logs.
- **Prayer-time widget** — sidebar/topbar widget computed offline (PrayTimes, Kemenag RI + 5 methods), city geocoding, countdown, notifications and sound.
- **Global shortcut** — `Ctrl+Shift+Space` (Cmd on macOS) summons the window from any application.

### Settings & data
- **Tabbed settings** — General, Terminal, Data & Backup, Diagnostics, AI Agent, and Prayer; changes save automatically.
- **Theme & language** — dark/light/system theme (follows the OS live) and an instant EN/ID interface switch.
- **Workspace backup** — export everything (projects incl. `.env` secrets, config, presets, health) into a single file, optionally encrypted with AES-256-GCM; import merges without overwriting.
- **Diagnostics** — local crash dumps with a viewer, main-log tail, and a system environment check for 17 tools (node, npm, git, php, composer, python, go, java, docker, mysql, redis, omp, …).
- **Updates** — checks GitHub for new releases, downloads and installs in-app.
- **Desktop integration** — minimize to tray, start on boot, auto-start projects on launch.

## Tech Stack

- Electron 43
- React 19
- Vite 8
- Tailwind CSS 4
- electron-builder 26

## Quick Start

Requirements: Windows, Node.js ≥ 20, npm, plus whatever runtimes your projects need (PHP, Go, Node.js, …). Tested with Node.js v23.9.0 and npm 10.9.2.

```powershell
npm install
npm run dev
```

`npm run dev` starts Vite and Electron together. Closing Electron also stops Vite (handled by `concurrently`).

To run the UI in a plain browser without Electron APIs:

```powershell
npm run dev:vite
```

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start Vite + Electron (development) |
| `npm run dev:vite` | Renderer only, in a browser with mock data |
| `npm run dev:electron` | Electron only (Vite must already be running on port 5173) |
| `npm test` / `npm run test:unit` | All Vitest unit + integration tests |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Vitest with coverage report |
| `npm run test:e2e` | Playwright end-to-end tests (Electron) |
| `npm run lint` / `npm run lint:fix` | ESLint |
| `npm run typecheck` | JSDoc typecheck for `// @ts-check` files |
| `npm run changelog` / `npm run changelog:apply` | Generate CHANGELOG.md from conventional commits (dry-run / apply) |
| `npm run icons` | Generate app icons into `build/` |
| `npm run preview` | Preview the renderer build |
| `npm run build` | Build renderer, then package NSIS + portable |
| `npm run build:win` | Build Windows x64 |

## Documentation

- [Setup & troubleshooting](docs/SETUP.md)
- [Architecture & data model](docs/ARCHITECTURE.md)
- [IPC contract](docs/IPC_API.md)
- [Feature status](docs/FEATURE_STATUS.md)
- [Roadmap to release](docs/ROADMAP.md)
- [Keyboard shortcuts](docs/KEYBOARD_SHORTCUTS.md)
- [Testing guide](docs/TESTING_GUIDE.md)
- [Changelog](CHANGELOG.md)

The detailed docs are written in Bahasa Indonesia.

## Project Layout

```
electron/       Electron main process, IPC handlers, managers
src/            React renderer: hooks, components, styles, i18n
tests/          Vitest mocks + setup
e2e/            Playwright end-to-end tests
scripts/        Utility scripts (icons, changelog generator)
.github/        CI workflow (lint, test, build, e2e on Windows/macOS/Linux)
dist-react/     Vite output (generated)
dist/           electron-builder output (generated)
```

## Where Data Lives

Nothing is stored in the repository. Electron uses `app.getPath('userData')`:

```
<userData>/projects.json
<userData>/config.json
<userData>/presets.json
<userData>/activities.json
<userData>/health.json
<userData>/agent-sessions.json
<userData>/crashDumps/            (local minidumps)
<userData>/backups/projects-<timestamp>.json
<userData>/omp/omp.exe            (managed omp binary)
```

`StorageManager` prints the exact location on startup.

## AI Agent (oh-my-pi)

The **Agent** menu in the sidebar runs the [oh-my-pi (omp)](https://omp.sh) coding agent inside each project:

- Sessions are grouped per project; text, thinking, and tool cards stream in real time over omp's RPC protocol.
- Create/rename/delete/pin/search sessions, export to Markdown, branch from any message, run bash commands, per-session drafts, and a notification when a turn finishes.
- Token usage and cost per turn are tracked and shown in the session list and composer.
- Install the omp binary from **Settings → AI Agent** (no admin rights, SHA256-verified) or let it pick up an existing install from PATH. Providers are configured via `omp setup` or the custom-provider form.

## Important Notes

- Start commands run through your local shell. Only add projects and commands you trust.
- App icons are generated into `build/` with `npm run icons` (`scripts/generate-icons.js`); `build/` is gitignored, so run the script before packaging.
- The preview uses a native WebContentsView (persistent per-project sessions) and falls back to an iframe when native views aren't available.
- Windows x64 is the primary target. macOS and Linux run in CI (3-OS matrix) and platform-specific paths are handled, but the packaged apps are not yet validated on real machines.
- A global shortcut (`Ctrl+Shift+Space` on Windows/Linux, `Cmd+Shift+Space` on macOS) summons the window from anywhere.

## License

MIT
