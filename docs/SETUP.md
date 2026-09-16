# Setup, Build, dan Troubleshooting

## Prasyarat

- Windows 10/11 x64
- Node.js modern dan npm
- Git untuk development
- Runtime yang dibutuhkan project terdaftar, misalnya Node.js/npm, PHP/Composer, atau Go

Repository mendeklarasikan `engines: { node: ">=20.0.0" }`. Versi kanonik ada di **`.nvmrc`**: `23.9.0` (versi nvm tertinggi yang terpasang di mesin dev, bundel npm 10.9.2) — sama dengan yang dipakai CI (`ci.yml` & `release.yml`).

```powershell
# pakai versi kanonik
nvm use
node -v   # v23.9.0
npm -v    # 10.9.2
```

## Instalasi

```powershell
git clone <repository-url>
nvm use
npm install
```

Jangan edit `node_modules`, `dist-react`, atau `dist` secara manual.

## Development

### Electron + renderer

```powershell
npm run dev
```

Flow (`electron-vite dev` — satu proses, bukan `concurrently`):

1. electron-vite membangun bundle main + preload, lalu membuka dev server renderer di port `5173`.
2. Electron di-spawn dan memuat `http://localhost:<port>` beserta DevTools.
3. Perubahan pada `electron/` memicu restart main process; perubahan pada `src/` memakai HMR renderer.
4. Saat Electron ditutup, electron-vite menghentikan dev server sekaligus.

Port dev dapat diubah lewat env `VITE_DEV_PORT` (dipakai konsisten oleh `electron.vite.config.mjs`, `vite.config.js`, `playwright.config.js`, `electron/main.ts`, dan pengecekan trusted-IPC di `electron/utils/ipcSecurity.ts`):

```powershell
$env:VITE_DEV_PORT = 5300; npm run dev
```

### Renderer saja

```powershell
npm run dev:vite
```

Browser mode menggunakan mock project/config dari `src/data/` (facade `src/utils/ipcRenderer.ts`). Folder picker dan operasi native tidak tersedia.

### Electron saja

Terminal 1:

```powershell
npm run dev:vite
```

Terminal 2:

```powershell
npm run dev:electron
```

## Test dan Build

Regression check:

```powershell
npm test
```

Suite saat ini: **910 test Vitest di 99 file** (unit + integrasi) yang mencakup ProcessManager, schema/migration, transaction storage concurrent, atomic write, recovery JSON project rusak, handler IPC, registry MCP, dan komponen renderer.

Gate kualitas lengkap — jalankan manual sebelum merge, karena CI push/PR **hanya** menjalankan dua perintah pertama:

```powershell
npm run lint        # dijalankan ci.yml
npm run typecheck   # dijalankan ci.yml
npm test            # hanya jalan di CI pada tag rilis
npm run test:e2e    # 29 test Playwright di 15 spec; tidak pernah dijalankan CI
```

Build renderer tanpa packaging:

```powershell
npx vite build
```

Build installer dan portable Windows:

```powershell
npm run build:win
```

Output diarahkan ke `dist/`. Config membuat target NSIS dan portable x64. Nama artifact mengikuti default electron-builder karena `artifactName` belum ditentukan.

## Prasyarat Packaging

`electron-builder.json` mengharapkan:

```text
build/icon.png
```

`electron/main.ts` (di-bundle ke `out/main/index.js`) juga mengharapkan:

```text
build/icon.png
```

Ketiga asset icon (`build/icon.ico`, `build/icon.png`, `build/icon-tray.png`) **di-commit ke repo** (pengecualian di `.gitignore`), jadi CI packaging selalu memakai icon aplikasi — tanpa ini electron-builder fallback ke icon default Electron. Untuk mengubah artwork, regenerate dengan satu perintah (tanpa dependency tambahan):

```bash
npm run icons
```

Script `scripts/generate-icons.js` menulis `build/icon.ico` (256px), `build/icon.png` (512px), dan `build/icon-tray.png` (32px) — mark **workspace grid**: tiga tile project dan satu tile launch. Setelah regenerate, commit ulang assetnya.

## Data dan Backup

Electron membuat data di `app.getPath('userData')`:

```text
projects.json                 registry project
config.json                   app config
presets.json                  workspace preset
activities.json               activity feed
health.json                   crash/run history + tren resource
agent-sessions.json           registry session agent
preview-credentials.json      kredensial preview (encrypted via safeStorage)
backups/                      rotasi backup projects.json (5 terbaru)
logs/main.log                 log main process (dirotasi)
crashDumps/                   minidump lokal
omp/omp.exe                   binary agent terkelola
```

Repository tidak pernah menyimpan data ini. `preview-credentials.json` sengaja **tidak** ikut backup/export.

Setiap save project:

1. File saat ini disalin ke backup timestamped.
2. Maksimal lima backup terbaru dipertahankan.
3. Data baru ditulis ke temp file unik, lalu di-rename.
4. JSON project rusak dipulihkan dari backup valid terbaru bila tersedia.

Mutation project dan config diantrikan di main process. Request concurrent diproses berurutan agar update tidak saling menimpa.

Runtime status, PID, dan log tidak persisten. Semua project kembali `stopped` setelah aplikasi dibuka ulang.

## Menambahkan Project

Field wajib backend:

- `name`
- `path`
- `port`
- `startCommand`

Nama bersifat case-insensitive unique. Path harus unique secara string. Folder dipilih melalui dialog Electron, lalu framework dapat dideteksi otomatis.

Supported detector (urutan evaluasi penting — lihat `electron/managers/ProjectDetector.ts`):

| Type | Marker | Default command | Port |
|---|---|---|---:|
| `LARAVEL` | `artisan` **dan** `laravel/framework` di `composer.json` | `php artisan serve` | 8000 |
| `NEXTJS` | dependency `next` | `npm run dev` | 3000 |
| `VUE` | dependency `vue` | `npm run dev` | 5173 |
| `REACT_VITE` | dependency `vite` **dan** `react` | `npm run dev` | 5173 |
| `REACT` | dependency `react` (tanpa Vite/Next) | `npm start` | 3000 |
| `GOLANG` | `go.mod` atau `main.go` | `go run .` | — |
| `PYTHON` | `requirements.txt`, `pyproject.toml`, `main.py`, atau `app.py` | `python main.py` | — |
| `NODEJS` | `package.json` (fallback) | `npm start` | 3000 |

Laravel sengaja dievaluasi lebih dulu karena project Inertia juga memakai Vite; `REACT_VITE` mendahului `REACT` agar project Vite tidak jatuh ke Create React App. Bila tidak ada marker yang cocok, project dibuat sebagai **Custom** tanpa command/port default. Untuk Laravel, port tambahan dibaca dari `.env` dan script dev Composer bila ada (`electron/utils/projectDetection.ts`).

## Troubleshooting

### `npm run dev` tidak kembali ke prompt

`npm run dev` menjalankan `electron-vite dev` sebagai satu proses — menutup window Electron menghentikan dev server sekaligus. Jika prompt tetap tertahan, pastikan tidak ada process `electron.exe` sisa yang masih memegang port.

### Port 5173 sudah dipakai

Cari proses pemilik port:

```powershell
Get-NetTCPConnection -LocalPort 5173
```

Hentikan proses terkait, atau jalankan di port lain tanpa mengubah kode:

```powershell
$env:VITE_DEV_PORT = 5300; npm run dev
```

### Project tidak bisa start

- Pastikan path masih ada.
- Jalankan `startCommand` langsung dari folder project untuk melihat error runtime.
- Pastikan executable tersedia di `PATH` aplikasi Electron.
- Cek log Project Detail dan console Electron.
- Command dengan quoting kompleks bergantung pada shell Windows.

### Stop lama

DevLauncher mencoba menghentikan process tree. Grace period lima detik, lalu force kill. UI menampilkan `Stopping` dan menonaktifkan tombol selama proses ini.

### PID tetap tampil

PID dibersihkan saat event exit diterima dan setelah stop selesai. Jika masih tampil, cek apakah child process mengabaikan kill atau renderer kehilangan event IPC.

### Data project hilang/rusak

Periksa folder `backups` di `userData`. Recovery otomatis hanya terjadi untuk JSON project yang gagal diparse. Config rusak kembali ke default tanpa recovery backup.

### Build installer gagal

- Pastikan `build/icon.ico` dan `build/icon.png` ada.
- Pastikan tidak ada executable hasil build yang sedang berjalan.
- Jalankan `npx vite build` lebih dulu untuk memisahkan error renderer dari packaging.

## Verification Sebelum Merge

CI push/PR hanya menjalankan `lint` + `typecheck`, jadi sisanya adalah tanggung jawab kamu sebelum merge:

```powershell
npm run lint
npm run typecheck
npm test
npx vite build
git diff --check
```

Untuk perubahan Electron, lakukan smoke test manual: add project, start, log muncul, stop menampilkan `Stopping`, PID hilang, close app, dan pastikan tidak ada process orphan.
