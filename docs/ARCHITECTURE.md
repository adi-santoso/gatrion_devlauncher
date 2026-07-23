# Arsitektur

## Gambaran

DevLauncher memakai tiga boundary Electron:

```text
React renderer
  -> window.electron (contextBridge)
  -> ipcRenderer.invoke / events
  -> ipcMain handlers
  -> managers (process, storage, detection)
  -> OS/filesystem/child process
```

Renderer tidak mendapat akses Node.js langsung. `nodeIntegration` nonaktif dan `contextIsolation` aktif.

## Struktur Source

```text
electron/
  main.js                       lifecycle window dan app
  preload.js                    API aman ke renderer
  handlers/
    projectHandlers.js          CRUD, browse folder
    processHandlers.js          lifecycle process dan events
  managers/
    ProcessManager.js           spawn, stop tree, status, log buffer
    ProjectDetector.js          deteksi framework
    StorageManager.js           JSON, backup, recovery, config

src/
  App.jsx                       navigation dan orchestration UI aktif
  hooks/
    useProjects.js              state project + CRUD IPC
    useProcesses.js             lifecycle process + event subscriptions
    useElectronConfig.js        config IPC
  utils/ipcRenderer.js          wrapper IPC + browser mocks
  components/
    Dashboard/                  dashboard aktif
    Projects/                   grid/list aktif
    ProjectDetail/              detail/log/env/settings UI
    Settings/                   app settings UI
    Layout/, Modals/, Common/   shell dan reusable UI
    Pages/, Project/, Terminal/ komponen generasi lama/legacy
  store/appStore.js             Zustand store legacy
```

`App.jsx` memakai komponen `Dashboard`, `Projects`, `ProjectDetail`, dan `Settings`, bukan komponen di `Pages/`. Zustand store hanya dipakai tree legacy.

## Main Process Lifecycle

1. `app.whenReady()` memanggil `initialize()`.
2. Managers dibuat dan storage diinisialisasi.
3. BrowserWindow dibuat.
4. IPC handlers didaftarkan.
5. Development memuat Vite port 5173; production memuat `dist-react/index.html`.
6. `before-quit` mencegah exit sementara, menghentikan semua process aktif, lalu `app.exit(0)`.

Jika storage gagal diinisialisasi, app mencatat error dan quit.

## Process Lifecycle

Status canonical backend:

```text
STOPPED -> STARTING -> RUNNING -> STOPPING -> STOPPED
                                -> ERROR
```

Renderer menormalisasi status ke lowercase.

Start:

1. Validasi ID, path, dan command non-empty.
2. Simpan record `STARTING` di Map.
3. Jalankan command dengan `child_process.spawn(command, { shell: true })`.
4. Simpan PID dan ubah ke `RUNNING`.
5. Stream stdout/stderr melalui IPC.

Stop:

1. Ubah status ke `STOPPING`.
2. Kirim status ke renderer agar tombol dinonaktifkan.
3. Windows memakai `taskkill /pid <pid> /T`; Unix mencoba signal ke process group.
4. Setelah lima detik, lakukan force kill.
5. Saat exit, status menjadi `STOPPED` dan PID menjadi `null`.

Exit spontan dengan code non-zero menjadi `ERROR`. Log backend dan frontend masing-masing dibatasi secara konsep hingga 1000 entry, tetapi frontend listener saat ini belum menerapkan trimming.

## Storage

Path dasar berasal dari `app.getPath('userData')`.

Project save memakai backup dan atomic rename. Lima backup terbaru disimpan. Recovery otomatis hanya untuk syntax error `projects.json`.

Operasi project dan config diserialisasi melalui queue terpisah. CRUD project memakai transaction `updateProjects`, sehingga load-modify-save berjalan sebagai satu unit. Atomic write memakai nama temp unik untuk mencegah collision.

## Model Project Aktual

Data dibuat dari ProjectModal, dinormalisasi, divalidasi, lalu disimpan dengan field allowlist berikut:

```js
{
  id: 'uuid',
  name: 'storefront-web',
  path: 'D:/projects/storefront-web',
  type: 'REACT_VITE',
  startCommand: 'npm run dev',
  port: 5173,
  envVars: [{ key: 'NODE_ENV', value: 'development' }],
  emoji: '⚛️',
  color: '#61DAFB',
  createdAt: 'ISO timestamp',
  lastRun: null
}
```

Runtime-only fields tidak dipersist:

```js
{
  status: 'running',
  pid: 1234,
  uptime: null,
  errorMessage: null
}
```

Catatan: `start-all-projects` membaca `project.env`, sedangkan flow individual mengubah `envVars` menjadi object. Ini perlu disatukan.

## Model Config

Backend default:

```js
{
  theme: 'dark',
  sidebarExpanded: true,
  startOnBoot: false,
  minimizeToTray: true,
  autoStartProjects: false,
  notifications: { onStart: true, onError: true, sound: false },
  terminal: { fontSize: 14, maxLines: 1000, autoScroll: true }
}
```

Config lama dengan key flat seperti `notifyOnStart`, `terminalFontSize`, dan `terminalMaxLines` dimigrasikan ke schema nested saat dibaca, lalu ditulis ulang secara canonical.

## State Flow Renderer

- `useProjects` menjadi source of truth project aktif.
- Backend event `projects-updated` mengganti persisted fields sambil mempertahankan runtime status.
- `useProcesses` menyimpan status/log lokal dan mengirim runtime update ke `useProjects` melalui callback.
- `useElectronConfig` di App menjadi source of truth config aktif dan diteruskan ke Settings.
- Navigation memakai local state `currentView`, bukan router.

## Security Boundary

Sudah ada:

- `contextIsolation: true`
- `nodeIntegration: false`
- preload hanya mengekspos method terpilih
- renderer tidak mengakses `ipcRenderer` langsung

Risiko terbuka:

- Command user dijalankan dengan `shell: true`; hanya command tepercaya boleh digunakan.
- IPC belum memvalidasi type/shape semua payload.
- `update-project` menerima arbitrary merge, termasuk perubahan `id`.
- `removeAllListeners(channel)` diekspos dan channel tidak di-allowlist.
- CSP eksplisit belum diverifikasi/diterapkan.
- Path start tidak divalidasi ulang sebagai directory sebelum spawn.

## Technical Debt Utama

- `App.jsx` memegang terlalu banyak orchestration dan placeholder handlers.
- Dua generasi komponen hidup bersamaan.
- Zustand dependency/store legacy belum diputuskan.
- Config dan project schema tidak tunggal.
- IPC response shapes tidak konsisten.
- Backend punya channel log yang tidak diekspos preload.
- Event logs frontend dapat tumbuh tanpa batas.
- Belum ada resource monitoring nyata.
- Asset packaging icon belum ada.

Prioritas dan acceptance criteria tersedia di [Roadmap](ROADMAP.md).
