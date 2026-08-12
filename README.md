# DevLauncher

DevLauncher adalah aplikasi desktop Windows untuk mendaftarkan, menjalankan, menghentikan, dan memantau beberapa project development dari satu UI. Project didukung saat ini: Laravel, Next.js, React/Vite, Vue, Go, Node.js, dan custom command.

Status project: **development / belum production-ready**. CRUD project, deteksi framework, lifecycle process, log real-time, penyimpanan lokal, dan build renderer sudah bekerja. Beberapa kontrol UI masih mock atau belum terhubung; lihat [Feature Status](docs/FEATURE_STATUS.md).

## Tech Stack

- Electron 43
- React 19
- Vite 8
- Tailwind CSS 4
- Zustand 5 (hanya dipakai komponen legacy)
- electron-builder 26

## Quick Start

Prasyarat: Windows, Node.js modern, npm, serta runtime project yang akan dijalankan (misalnya PHP, Go, atau Node.js). Project saat ini diverifikasi dengan Node.js `v23.9.0` dan npm `10.9.2`.

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
| `npm run dev` | Jalankan Vite dan Electron |
| `npm run dev:vite` | Jalankan renderer di browser dengan mock data |
| `npm run dev:electron` | Jalankan Electron; Vite port 5173 harus sudah aktif |
| `npm test` | Jalankan regression check ProcessManager |
| `npm run preview` | Preview hasil build renderer |
| `npm run build` | Build renderer lalu NSIS + portable package |
| `npm run build:win` | Build Windows x64 |

## Dokumentasi

- [Setup dan troubleshooting](docs/SETUP.md)
- [Arsitektur dan model data](docs/ARCHITECTURE.md)
- [Kontrak IPC](docs/IPC_API.md)
- [Status fitur aktual](docs/FEATURE_STATUS.md)
- [Roadmap sampai release](docs/ROADMAP.md)

## Struktur Ringkas

```text
electron/       Electron main process, IPC handlers, managers
src/            React renderer, hooks, components, styles
template/       Template HTML sumber desain
dist-react/     Output Vite (generated)
dist/           Output electron-builder (generated)
```

## Data Lokal

Data tidak disimpan di repository. Electron memakai `app.getPath('userData')`:

```text
<userData>/projects.json
<userData>/config.json
<userData>/backups/projects-<timestamp>.json
```

Lokasi tepat dicetak oleh `StorageManager` saat aplikasi mulai.

## Batasan Penting

- Start command dijalankan melalui shell lokal. Tambahkan hanya project dan command yang dipercaya.
- CPU/RAM monitoring, native tray, startup OS, port conflict resolution, bulk action, edit project, dan aksi native lain sudah terimplementasi.
- Ikon aplikasi (motif G) digenerate ke `build/` via `npm run icons` (`scripts/generate-icons.js`); folder `build/` di-`.gitignore` sehingga script wajib dijalankan sebelum packaging.
- Target utama Windows x64. macOS/Linux belum diuji.

## Lisensi

MIT
