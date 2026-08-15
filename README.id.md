# DevLauncher

> [English](README.md) | **Bahasa Indonesia**

DevLauncher adalah aplikasi desktop untuk mengelola semua project development dari satu jendela. Daftarkan project, mulai dan hentikan process-nya, pantau log-nya, jalankan perintah git, kelola dependency, lalu buka preview aplikasinya — semuanya dari satu UI. Mendukung Laravel, Next.js, React/Vite, Vue, Go, Node.js, dan project lain dengan start command custom.

Status: **masih development — belum siap production**. Lihat [Feature Status](docs/FEATURE_STATUS.md) untuk status tiap fitur dan [Changelog](CHANGELOG.md) untuk riwayat lengkap.

## Fitur

### Manajemen project
- **Daftarkan folder mana pun sebagai project** — framework terdeteksi otomatis (Laravel, Next.js, React/Vite, Vue, Go, Node.js, atau Custom) beserta start command dan port-nya. Setiap project bisa punya start command, environment variable, dan tag sendiri.
- **CRUD lengkap** — edit, duplikasi, atau hapus project; drag & drop folder ke jendela untuk mengisi form otomatis. Export/import project sebagai JSON portabel (import merge tanpa menimpa duplikat).
- **Workspace presets** — simpan sekelompok project sebagai preset dan start/stop seluruh stack dengan satu klik, lengkap dengan stagger delay dan progress per project.

### Kontrol process
- **Start / stop / restart** per project atau sekaligus (`Start All` / `Stop All`), dengan transisi status yang terlihat (Starting → Running → Stopping → Stopped) dan pelacakan PID.
- **Auto-restart** project yang crash dengan exponential backoff serta retries/delay yang bisa diatur; restart cerdas menunggu port lama dilepas dulu.
- **Urutan dependency** — project bisa mendeklarasikan `dependsOn`, dan Start All menghormati urutan topologi; konflik port terdeteksi sebelum start.
- **Monitoring** — CPU/RAM disampling tiap 4 detik dengan riwayat 30 titik dan sparkline di dashboard; crash terdeteksi dari exit code non-zero.
- **Notifikasi** — notifikasi native Windows dengan action button (Restart saat crash, Restart & install saat update siap).

### Log & terminal
- **Log real-time** — stdout/stderr mengalir langsung per project, dengan pencarian, highlight, dan filter tipe (stdout/stderr/error/warn/system). Log yang sangat panjang divirtualisasi agar ribuan baris tetap mulus di-scroll.
- **Terminal interaktif** — buka shell PTY sungguhan per project langsung di dalam aplikasi.
- **Main log** — log proses utama dirotasi otomatis dan bisa dilihat ekornya dari Settings.

### Project Detail
- **Tab Git** — status, stage/unstage, commit, log, diff, checkout branch, pull/push, stash, discard changes, dan blame.
- **Tab Dependencies** — `npm outdated` dalam tabel (current/wanted/latest), update satu paket atau sekaligus dengan backup otomatis `package.json` dan lockfile.
- **Tab Environment** — lihat/edit file `.env` dengan quick-switch profil (base/dev/staging/production) dan secret yang di-mask (KEY/TOKEN/SECRET/PASSWORD).
- **Tab Analytics** — riwayat crash, riwayat run dengan uptime, total run/uptime, tren CPU/memori harian.
- **Script runner** — jalankan script `package.json` mana pun dengan health check.
- **App preview** — aplikasi yang berjalan dibuka di view native embedded (WebContentsView) dengan sesi persisten per project (cookies/storage bertahan), plus mode focus dengan DevTools.

### AI coding agent (oh-my-pi)
- **Chat streaming per project** lewat protokol RPC omp — teks, thinking, dan tool cards mengalir real-time.
- **Session** dikelompokkan per project: buat, rename, hapus, pin, cari, export ke Markdown, branch dari pesan mana pun, jalankan bash, dan draft per session.
- **Cost tracking** — pemakaian token per turn dan per session, dengan estimasi biaya per model.
- **Installer bawaan** — unduh binary omp (verifikasi SHA256, tanpa admin rights) dan konfigurasi provider dari Settings, atau deteksi otomatis instalasi existing dari PATH.

### Lintas workspace
- **Command palette** (`Ctrl+K`) — lompat ke project, session agent, file (pencarian file di workspace dengan highlight), dan command bawaan.
- **Dashboard** — ringkasan status live, workspace presets, group-by-tag, activity feed, dan recent logs.
- **Widget pengingat sholat** — widget sidebar/topbar dihitung offline (PrayTimes, Kemenag RI + 5 metode), geocode kota, countdown, notifikasi dan suara.
- **Global shortcut** — `Ctrl+Shift+Space` (Cmd di macOS) memanggil jendela aplikasi dari aplikasi lain mana pun.

### Settings & data
- **Settings bertab** — General, Terminal, Data & Backup, Diagnostics, AI Agent, dan Prayer; perubahan tersimpan otomatis.
- **Tema & bahasa** — tema dark/light/system (mengikuti OS secara live) dan peralihan bahasa antarmuka EN/ID secara instan.
- **Backup workspace** — export semua data (project termasuk secret `.env`, config, presets, health) menjadi satu file, opsional dienkripsi AES-256-GCM; import merge tanpa menimpa.
- **Diagnostics** — crash dump lokal dengan viewer, ekor main log, dan pemeriksaan environment sistem untuk 17 tools (node, npm, git, php, composer, python, go, java, docker, mysql, redis, omp, dll).
- **Update** — memeriksa rilis terbaru di GitHub, unduh dan pasang langsung dari aplikasi.
- **Integrasi desktop** — minimize ke tray, start saat boot, auto-start project saat aplikasi dibuka.

## Tech Stack

- Electron 43 — main process di-bundle dengan [electron-vite](https://electron-vite.org) 5
- React 19
- Vite 7 (renderer)
- TypeScript 5.9 — **strict, 100% kode aplikasi** (renderer `.tsx` + main process `.ts`)
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
| `npm test` / `npm run test:unit` | Semua test unit + integrasi Vitest |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Vitest dengan coverage report |
| `npm run test:e2e` | Playwright end-to-end test (Electron) |
| `npm run lint` / `npm run lint:fix` | ESLint |
| `npm run typecheck` | Typecheck TypeScript strict (renderer + main process, 0 error) |
| `npm run changelog` / `npm run changelog:apply` | Generate CHANGELOG.md dari conventional commits (dry-run / apply) |
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
- [Roadmap rewrite TypeScript](docs/ROADMAP_TS.md)
- [Keyboard shortcuts](docs/KEYBOARD_SHORTCUTS.md)
- [Panduan testing](docs/TESTING_GUIDE.md)
- [Changelog](CHANGELOG.md)

Dokumentasi detail ditulis dalam Bahasa Indonesia.

## Struktur Project

```
electron/       Main process Electron, IPC handlers, managers
src/            React renderer: hooks, components, styles, i18n
tests/          Mock + setup Vitest
e2e/            Playwright end-to-end test
scripts/        Utility script (generate-icons, generator changelog)
.github/        CI workflow (lint, test, build, e2e di Windows/macOS/Linux)
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
<userData>/crashDumps/            (minidump lokal)
<userData>/backups/projects-<timestamp>.json
<userData>/omp/omp.exe            (binary omp terkelola)
```

Lokasi tepatnya dicetak oleh `StorageManager` saat aplikasi mulai.

## AI Agent (oh-my-pi)

Menu **Agent** di sidebar menjalankan coding agent [oh-my-pi (omp)](https://omp.sh) di dalam tiap project:

- Session dikelompokkan per project; teks, thinking, dan tool cards mengalir real-time lewat protokol RPC omp.
- Buat/rename/hapus/pin/cari session, export ke Markdown, branch dari pesan mana pun, jalankan bash, draft per session, dan notifikasi saat turn selesai.
- Pemakaian token dan biaya per turn dilacak dan ditampilkan di daftar session serta composer.
- Binary omp di-install lewat **Settings → AI Agent** (tanpa admin rights, verifikasi SHA256) atau terdeteksi otomatis dari PATH. Provider dikonfigurasi via `omp setup` atau form custom provider.

## Catatan Penting

- Start command dijalankan lewat shell lokal. Hanya tambahkan project dan command yang kamu percaya.
- Icon aplikasi digenerate ke `build/` dengan `npm run icons` (`scripts/generate-icons.js`); folder `build/` di-`.gitignore`, jadi jalankan script ini sebelum packaging.
- Preview memakai WebContentsView native (sesi persisten per project) dengan fallback iframe bila view native tidak tersedia.
- Target utama Windows x64. macOS dan Linux sudah berjalan di CI (matrix 3 OS) dan path spesifik platform sudah ditangani, tapi app hasil packaging belum divalidasi di mesin sungguhan.
- Global shortcut (`Ctrl+Shift+Space` di Windows/Linux, `Cmd+Shift+Space` di macOS) memanggil jendela dari mana saja.

## Lisensi

MIT
