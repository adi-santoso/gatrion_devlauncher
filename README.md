# DevLauncher

> **English** | [Bahasa Indonesia](README.id.md)

DevLauncher is a Windows desktop app for keeping all your development projects in one place. Register a project, start and stop it, watch its logs, and jump into its preview — all from a single window. It works with Laravel, Next.js, React/Vite, Vue, Go, Node.js, and anything with a custom start command.

Main features: process lifecycle (start/stop/restart), live logs, an embedded app preview (native WebContentsView with per-project persistent sessions), a Git tab and script runner in Project Detail, dependency manager, env profiles & secrets, health analytics, workspace presets, command palette, a prayer-time widget, and an AI coding agent (oh-my-pi) with real-time streaming chat per project.

Status: **in development — not production-ready yet**. Project CRUD, framework detection, process lifecycle, live logs, local storage, and the renderer build all work. See [Feature Status](docs/FEATURE_STATUS.md) for per-feature status and the [Changelog](CHANGELOG.md) for the full history.

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
| `npm test` | CLI regression tests for the main process (13 Node scripts) |
| `npm run test:unit` | Vitest unit tests (renderer + managers) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Vitest with coverage report |
| `npm run test:e2e` | Playwright smoke tests (Electron) |
| `npm run lint` / `npm run lint:fix` | ESLint |
| `npm run typecheck` | JSDoc typecheck for `// @ts-check` files |
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
src/            React renderer: hooks, components, styles
tests/cli/      Main-process CLI regression tests (npm test)
tests/setup.js  Vitest setup (globals + mock resets)
e2e/            Playwright smoke tests
scripts/        Utility scripts (icon generation)
.github/        CI workflow (Windows: lint, test, build, e2e)
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
<userData>/backups/projects-<timestamp>.json
<userData>/omp/omp.exe            (managed omp binary)
```

`StorageManager` prints the exact location on startup.

## AI Agent (oh-my-pi)

The **Agent** menu in the sidebar runs the [oh-my-pi (omp)](https://omp.sh) coding agent inside each project:

- Sessions are grouped per project; text, thinking, and tool cards stream in real time over omp's RPC protocol.
- Create/rename/delete/pin/search sessions, export to Markdown, branch from any message, run bash commands, per-session drafts, and a notification when a turn finishes.
- Install the omp binary from **Settings → AI Agent** (no admin rights, SHA256-verified) or let it pick up an existing install from PATH. Providers are configured via `omp setup` or the custom-provider form.

## Important Notes

- Start commands run through your local shell. Only add projects and commands you trust.
- App icons are generated into `build/` with `npm run icons` (`scripts/generate-icons.js`); `build/` is gitignored, so run the script before packaging.
- The preview uses a native WebContentsView (persistent per-project sessions) and falls back to an iframe when native views aren't available.
- Windows x64 is the primary target. macOS/Linux are untested.

## License

MIT
