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
electron/                      TypeScript, di-bundle electron-vite 5 → out/main + out/preload
  main.ts                       lifecycle window dan app (orchestrator tipis)
  preload.ts                    API aman ke renderer (contextBridge)
  ipcHandlers.ts                registrasi semua ipcMain.handle (implementasi per-domain di handlers/)
  notifications.ts              notifikasi native + aksi restart dari notifikasi
  configSchema.ts / projectSchema.ts   schema validasi + normalisasi
  handlers/
    projectHandlers.ts          CRUD project, browse folder
    processHandlers.ts          lifecycle process dan events
    agentHandlers.ts            AI Agent (omp): chat, sessions, RPC forwarding
    systemHandlers.ts           environment check, update checker
    repoHandlers.ts             Git: status/log/diff/stage/commit/stash/blame
    previewHandlers.ts          embedded preview (WebContentsView)
    terminalHandlers.ts         interactive PTY shell
    desktopHandlers.ts          tray, open external, reveal, notifications
    backupHandlers.ts           workspace backup (export/import terenkripsi)
  managers/
    ProcessManager.ts           spawn, stop tree, status, log buffer (dipecah: processTypes / processLogBase / processPortBase / processChildBase / processMetricsBase)
    ProjectDetector.ts          deteksi framework
    StorageManager.ts           JSON, backup, recovery, config
    OmpManager.ts + ompRpc.ts   RPC client oh-my-pi (NDJSON, per project)
    OmpInstaller.ts             install binary omp terkelola
    OmpConfig.ts                models.yml / config.yml omp
    HealthManager.ts            health & analytics (userData/health.json)
    PreviewManager.ts           sesi preview persisten per project
    TrayManager.ts              native tray
  utils/
    ipcSecurity.ts / ipcValidation.ts   validasi trusted IPC event + CHANNEL_RULES per channel
    logger.ts                   structured logging (userData/logs/main.log)
    logRotation.ts / logStore.ts / portCheck.ts / processTree.ts / pathKey.ts / versionCompare.ts
    messagesToMarkdown.ts       export percakapan agent ke Markdown
    workspaceBackup.ts / workspaceSearch.ts / updater.ts

src/                           TypeScript strict
  App.tsx                       controller tipis — orchestration dipindah ke hooks/modul
  hooks/                        orkestrasi state & data (useProjects, useProcesses, useElectronConfig, …)
  data/                         satu-satunya lapisan panggilan IPC (per-domain: projects, processes, agent, …)
  types/                        tipe domain murni (shared.d.ts, electron.d.ts)
  utils/ipcRenderer.ts          facade re-export src/data (browser mock per fungsi)
  components/
    Common/, Layout/            komponen presentasional murni + shell
    Dashboard/                  workspace dashboard aktif
    Projects/                   registry/grid/list aktif
    ProjectDetail/              detail/log/env/git/scripts/dependencies/analytics/preview UI
    Settings/                   app settings UI (termasuk kartu AI Agent)
    Agent/                      chat coding agent (streaming, tool cards, sessions)
    Terminal/                   terminal workspace & PTY
    Modals/, States/            modal global + loading states
```

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

Exit spontan dengan code non-zero menjadi `ERROR`. Log backend dan frontend masing-masing dibatasi (default 1000 entry per project, dapat diatur via config `terminal.maxLines`).

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
  tags: ['web'],
  customCommands: [{ id, name, command, port, primary, ... }],
  dependsOn: ['id-db'],
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

Project schema diversioning (`schemaVersion`) dengan normalisasi/validasi field allowlist; data lama dimigrasikan deterministik. Field `tags`, `customCommands`, dan `dependsOn` didukung dan dipersist.

## Model Config

Backend default (schema versioned di `configSchema.ts`):

```js
{
  theme: 'dark',
  sidebarExpanded: true,
  startOnBoot: false,
  minimizeToTray: true,
  autoStartProjects: false,
  notifications: { onStart: true, onError: true, sound: false },
  terminal: { fontSize: 14, maxLines: 1000, autoScroll: true },
  autoRestart: { enabled: false, maxRetries: 3, delayMs: 2000 },
  preview: { keepAlive: true },
  prayer: { showIn: 'both', method: 'KEMENAG', city: 'Jakarta', ... },
  agent: { notifyOnFinish: true },
  windowBounds: null,
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

- `contextIsolation: true`, `nodeIntegration: false`; preload hanya mengekspos method terpilih via contextBridge; renderer tidak mengakses `ipcRenderer` langsung.
- Seluruh IPC handler memakai `assertTrustedIpcEvent` (validasi event trusted) dan memvalidasi payload (allowlist field, bounds length, tipe input).
- `update-project` hanya menerima field persisted yang di-allowlist; ID dan runtime field tidak dapat diubah.
- CSP diterapkan di main process (dev mengizinkan inline script Vite).
- Nilai rahasia (KEY/TOKEN/SECRET/PASSWORD) di-mask di UI dan tidak di-log.
- Command user tetap dijalankan melalui shell lokal (`shell: true` untuk command yang memang butuh shell) — hanya project dan command tepercaya yang boleh ditambahkan.

## Technical Debt Utama

- IPC response shapes sebagian masih mengembalikan bentuk langsung alih-alih wrapper `{ success }` (konsolidasi bertahap lewat `safeHandle`).
- File test (`__tests__`) masih `.js`/`.jsx` — sengaja dikecualikan dari tsconfig; dapat dikonversi ke TS bila diperlukan.
- `noUncheckedIndexedAccess` belum diaktifkan (opsional — evaluasi per folder).
- e2e Playwright masih smoke-level untuk sebagian alur (alur inti project/settings/agent sudah ter-cover).

Prioritas dan acceptance criteria tersedia di [Roadmap](ROADMAP.md).
