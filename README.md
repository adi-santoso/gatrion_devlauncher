# DevLauncher

DevLauncher adalah aplikasi desktop Windows untuk mendaftarkan, menjalankan, menghentikan, dan memantau beberapa project development dari satu UI. Project didukung saat ini: Laravel, Next.js, React/Vite, Vue, Go, Node.js, dan custom command.

Fitur utama: lifecycle process (start/stop/restart), log real-time, **preview aplikasi embedded** (native WebContentsView dengan sesi persisten per project), **tab Git** (status/commit/log/branch/stash/blame) dan **script runner** di project detail, **dependency manager**, **env profiles & secrets**, **health & analytics**, workspace presets, command palette, **widget pengingat sholat** (offline, metode Kemenag RI), serta **AI coding agent (oh-my-pi)** dengan chat streaming real-time per project.

Status project: **development / belum production-ready**. CRUD project, deteksi framework, lifecycle process, log real-time, penyimpanan lokal, dan build renderer sudah bekerja. Lihat [Feature Status](docs/FEATURE_STATUS.md) untuk status per fitur dan [Changelog](CHANGELOG.md) untuk riwayat perubahan.

## Tech Stack

- Electron 43
- React 19
- Vite 8
- Tailwind CSS 4
- electron-builder 26

## Quick Start

Prasyarat: Windows, Node.js ≥ 20, npm, serta runtime project yang akan dijalankan (misalnya PHP, Go, atau Node.js). Project saat ini diverifikasi dengan Node.js `v23.9.0` dan npm `10.9.2`.

```powershell
npm install
npm run dev
```

`npm run dev` menjalankan Vite dan Electron. Menutup Electron juga menghentikan Vite melalui `concurrently`.

Mode UI browser tanpa API native Electron:

```powershell
npm run dev:vite
```

## Commands

| Command | Fungsi |
|---|---|
| `npm run dev` | Jalankan Vite dan Electron (dev) |
| `npm run dev:vite` | Jalankan renderer di browser dengan mock data |
| `npm run dev:electron` | Jalankan Electron; Vite port 5173 harus sudah aktif |
| `npm test` | Regression check CLI main process (13 script Node) |
| `npm run test:unit` | Vitest — unit test renderer & manager |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Vitest dengan coverage report |
| `npm run test:e2e` | Playwright E2E smoke (Electron + Playwright) |
| `npm run lint` / `npm run lint:fix` | ESLint |
| `npm run typecheck` | JSDoc typecheck (tsc, file bertanda `// @ts-check`) |
| `npm run icons` | Generate icon app ke `build/` |
| `npm run preview` | Preview hasil build renderer |
| `npm run build` | Build renderer lalu package NSIS + portable |
| `npm run build:win` | Build Windows x64 |

## Dokumentasi

- [Setup dan troubleshooting](docs/SETUP.md)
- [Arsitektur dan model data](docs/ARCHITECTURE.md)
- [Kontrak IPC](docs/IPC_API.md)
- [Status fitur aktual](docs/FEATURE_STATUS.md)
- [Roadmap sampai release](docs/ROADMAP.md)
- [Keyboard shortcuts](docs/KEYBOARD_SHORTCUTS.md)
- [Panduan testing](docs/TESTING_GUIDE.md)
- [Changelog](CHANGELOG.md)

## Struktur Ringkas

```text
electron/       Electron main process, IPC handlers, managers
src/            React renderer, hooks, components, styles
tests/cli/      Regression test CLI main process (npm test)
tests/setup.js  Setup Vitest (globals + mock resets)
e2e/            Playwright smoke test
scripts/        Utility script (generate-icons)
.github/        CI workflow (Windows: lint, test, build, e2e)
dist-react/     Output Vite (generated)
dist/           Output electron-builder (generated)
```

## Data Lokal

Data tidak disimpan di repository. Electron memakai `app.getPath('userData')`:

```text
<userData>/projects.json
<userData>/config.json
<userData>/presets.json
<userData>/activities.json
<userData>/health.json
<userData>/agent-sessions.json
<userData>/backups/projects-<timestamp>.json
<userData>/omp/omp.exe            (binary omp terkelola)
```

Lokasi tepat dicetak oleh `StorageManager` saat aplikasi mulai.

## AI Agent (oh-my-pi)

Menu **Agent** di sidebar menyediakan coding agent berbasis [oh-my-pi (omp)](https://omp.sh) yang berjalan per project:

- Session dikelompokkan per project; chat streaming real-time (teks, thinking, tool cards) via RPC omp.
- Session management (new/rename/delete/pin/search), export ke Markdown, branch dari pesan, bash runner, draft per session, dan notifikasi saat turn selesai.
- Binary omp di-install lewat **Settings → AI Agent** (tanpa admin rights, verifikasi SHA256) atau terdeteksi otomatis dari PATH; provider diatur melalui `omp setup` / form custom provider.

## Batasan Penting

- Start command dijalankan melalui shell lokal. Tambahkan hanya project dan command yang dipercaya.
- Ikon aplikasi (motif G) digenerate ke `build/` via `npm run icons` (`scripts/generate-icons.js`); folder `build/` di-`.gitignore` sehingga script wajib dijalankan sebelum packaging.
- Preview project memakai native WebContentsView (sesi persisten per project) dengan fallback iframe bila view native tidak tersedia.
- Target utama Windows x64. macOS/Linux belum diuji.

## Lisensi

MIT
