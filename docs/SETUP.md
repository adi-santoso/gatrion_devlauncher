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

Flow:

1. Vite membuka port `5173`.
2. `wait-on` menunggu URL tersedia.
3. Electron memuat `http://localhost:5173` dan membuka DevTools.
4. Saat Electron exit, `concurrently --kill-others` menghentikan Vite.

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

Check saat ini mencakup ProcessManager, schema/migration, concurrent storage transaction, atomic writes, dan recovery JSON project rusak.

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

Script `scripts/generate-icons.js` menulis `build/icon.ico` (256px), `build/icon.png` (512px), dan `build/icon-tray.png` (32px) — tile rounded-square purple gradient dengan monogram "G". Setelah regenerate, commit ulang assetnya.

## Data dan Backup

Electron membuat data di `app.getPath('userData')`:

```text
projects.json
config.json
backups/
```

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

Supported detector:

| Type | Marker | Default command | Port |
|---|---|---|---:|
| Laravel | `artisan` + `laravel/framework` | `php artisan serve` | 8000 |
| Next.js | dependency `next` | `npm run dev` | 3000 |
| React/Vite | dependencies `vite` + `react`, atau `vite.config.js` | `npm run dev` | 5173 |
| Vue | dependency `vue` | `npm run dev` | 5173 |
| Go | `go.mod` atau `main.go` | `go run .` | 8080 |
| Node.js | `package.json` fallback | `npm start` | 3000 |
| Custom | tidak ada marker | kosong | kosong |

## Troubleshooting

### `npm run dev` tidak kembali ke prompt

Pastikan script `dev` masih memakai `concurrently --kill-others --success first`. Setelah Electron ditutup, Vite seharusnya mati maksimal sekitar tiga detik kemudian.

### Port 5173 sudah dipakai

Cari proses pemilik port:

```powershell
Get-NetTCPConnection -LocalPort 5173
```

Hentikan proses terkait atau ubah konfigurasi Vite dan URL Electron secara bersamaan. Keduanya saat ini hard-coded ke `5173`.

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

```powershell
npm test
npx vite build
git diff --check
```

Untuk perubahan Electron, lakukan smoke test manual: add project, start, log muncul, stop menampilkan `Stopping`, PID hilang, close app, dan pastikan tidak ada process orphan.
