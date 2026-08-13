# DevLauncher

> [English](README.md) | **Bahasa Indonesia**

DevLauncher adalah aplikasi desktop Windows untuk mengelola semua project development dari satu jendela. Daftarkan project, mulai dan hentikan process-nya, pantau log-nya, lalu buka preview aplikasinya — semuanya dari satu UI. Mendukung Laravel, Next.js, React/Vite, Vue, Go, Node.js, dan project lain dengan start command custom.

Fitur utamanya: lifecycle process (start/stop/restart), log real-time, preview aplikasi embedded (WebContentsView native dengan sesi persisten per project), tab Git dan script runner di Project Detail, dependency manager, env profiles & secrets, health & analytics, workspace presets, command palette, widget pengingat sholat, dan AI coding agent (oh-my-pi) dengan chat streaming real-time per project.

Status: **masih development — belum siap production**. CRUD project, deteksi framework, lifecycle process, log real-time, penyimpanan lokal, dan build renderer sudah berfungsi. Lihat [Feature Status](docs/FEATURE_STATUS.md) untuk status tiap fitur dan [Changelog](CHANGELOG.md) untuk riwayat lengkap.

## Tech Stack

- Electron 43
- React 19
- Vite 8
- Tailwind CSS 4
- electron-builder 26

## Quick Start

Prasyarat: Windows, Node.js ≥ 20, npm, plus runtime yang dibutuhkan project kamu (misalnya PHP, Go, atau Node.js). Terverifikasi dengan Node.js v23.9.0 dan npm 10.9.2.

```powershell
npm install
npm run dev
```

`npm run dev` menjalankan Vite dan Electron bersamaan. Menutup Electron otomatis menghentikan Vite (diurus oleh `concurrently`).

Mau menjalankan UI di browser biasa tanpa API Electron:

```powershell
npm run dev:vite
```

## Commands

| Command | Fungsi |
|---|---|
| `npm run dev` | Jalankan Vite + Electron (development) |
| `npm run dev:vite` | Renderer saja, di browser dengan mock data |
| `npm run dev:electron` | Electron saja (Vite harus sudah berjalan di port 5173) |
| `npm test` | Regression test CLI main process (13 script Node) |
| `npm run test:unit` | Test unit Vitest (renderer + managers) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Vitest dengan coverage report |
| `npm run test:e2e` | Playwright smoke test (Electron) |
| `npm run lint` / `npm run lint:fix` | ESLint |
| `npm run typecheck` | JSDoc typecheck untuk file bertanda `// @ts-check` |
| `npm run icons` | Generate icon aplikasi ke `build/` |
| `npm run preview` | Preview hasil build renderer |
| `npm run build` | Build renderer, lalu package NSIS + portable |
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

Dokumentasi detail ditulis dalam Bahasa Indonesia.

## Struktur Project

```
electron/       Main process Electron, IPC handlers, managers
src/            React renderer: hooks, components, styles
tests/cli/      Regression test CLI main process (npm test)
tests/setup.js  Setup Vitest (globals + mock resets)
e2e/            Playwright smoke test
scripts/        Utility script (generate-icons)
.github/        CI workflow (Windows: lint, test, build, e2e)
dist-react/     Output Vite (generated)
dist/           Output electron-builder (generated)
```

## Lokasi Data

Data tidak disimpan di repository. Electron memakai `app.getPath('userData')`:

```
<userData>/projects.json
<userData>/config.json
<userData>/presets.json
<userData>/activities.json
<userData>/health.json
<userData>/agent-sessions.json
<userData>/backups/projects-<timestamp>.json
<userData>/omp/omp.exe            (binary omp terkelola)
```

Lokasi tepatnya dicetak oleh `StorageManager` saat aplikasi mulai.

## AI Agent (oh-my-pi)

Menu **Agent** di sidebar menjalankan coding agent [oh-my-pi (omp)](https://omp.sh) di dalam tiap project:

- Session dikelompokkan per project; teks, thinking, dan tool cards mengalir real-time lewat protokol RPC omp.
- Buat/rename/hapus/pin/cari session, export ke Markdown, branch dari pesan mana pun, jalankan bash, draft per session, dan notifikasi saat turn selesai.
- Binary omp di-install lewat **Settings → AI Agent** (tanpa admin rights, verifikasi SHA256) atau terdeteksi otomatis dari PATH. Provider dikonfigurasi via `omp setup` atau form custom provider.

## Catatan Penting

- Start command dijalankan lewat shell lokal. Hanya tambahkan project dan command yang kamu percaya.
- Icon aplikasi digenerate ke `build/` dengan `npm run icons` (`scripts/generate-icons.js`); folder `build/` di-`.gitignore`, jadi jalankan script ini sebelum packaging.
- Preview memakai WebContentsView native (sesi persisten per project) dengan fallback iframe bila view native tidak tersedia.
- Target utama Windows x64. macOS/Linux belum diuji.

## Lisensi

MIT
