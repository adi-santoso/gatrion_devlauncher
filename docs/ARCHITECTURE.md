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
  ipcHandlers.ts                registerCoreIpcHandlers — channel lintas-domain (config, activity, preset, window, updater, MCP approval)
  notifications.ts              notifikasi native + aksi restart dari notifikasi
  configSchema.ts / projectSchema.ts   schema validasi + normalisasi
  handlers/                     136 channel IPC, semua lewat safeHandle + CHANNEL_RULES
    projectHandlers.ts          CRUD project, browse folder, import/export, workspace search (13)
    processHandlers.ts          lifecycle process, metrics, log, custom command (13)
    agentHandlers.ts            AI Agent (omp): chat, sessions, RPC forwarding, installer (47)
    systemHandlers.ts           environment check, main log, crash dump (6)
    repoHandlers.ts             Git, env file, Laravel log (23)
    dependencyHandlers.ts       outdated/update npm, composer, go, pip, cargo (8)
    previewHandlers.ts          embedded preview (WebContentsView) (14)
    previewCredentialHandlers.ts  kredensial preview (3)
    terminalHandlers.ts         interactive PTY shell (4)
    desktopHandlers.ts          open external, reveal, open in editor (3)
    backupHandlers.ts           workspace backup (export/import terenkripsi) (2)
  managers/
    ProcessManager.ts           spawn, stop tree, status, log buffer (dipecah: processTypes / processLogBase / processPortBase / processChildBase / processMetricsBase)
    ProjectDetector.ts          deteksi framework
    StorageManager.ts           JSON, backup, recovery, config
    OmpManager.ts + ompRpc.ts   RPC client oh-my-pi (NDJSON, per project)
    OmpInstaller.ts             install binary omp terkelola
    OmpConfig.ts                models.yml / config.yml omp
    HealthManager.ts            health & analytics (userData/health.json)
    PreviewManager.ts           sesi preview persisten per project
    CredentialManager.ts        kredensial preview (encrypted via safeStorage)
    TrayManager.ts              native tray
    vps/                        VPS Command Center (SSH) — terpisah dari ProcessManager
      VpsManager.ts             koneksi SSH persisten per server, policy agent, structured reads, PTY
      VpsTransport.ts           wrapper ssh2 (exec streaming, shell PTY, hostVerifier)
      vpsStore.ts               vps-servers.json + vps-hostkeys.json (tanpa secret)
      vpsCredentials.ts         vps-credentials.json (safeStorage, store terpisah)
      vpsJobRegistry.ts         job remote: output terbatas + redaksi, state jujur, cancel
      remoteCommand.ts          builder/parser murni (quoting, /proc, systemd, journalctl)
      vpsRedact.ts              redaksi output + bounded buffer
      vpsScopes.ts              scope MCP per sesi + writer .omp/mcp.json project-scoped
  mcp/                          MCP server agent-control (opt-in, localhost-only)
    server.ts                   HTTP Streamable + JSON-RPC 2.0, token Bearer per-launch
    toolsShared.ts              tipe, model izin, dispatchTool
    toolsRead.ts / toolsWrite.ts / toolsWriteMisc.ts / toolsDestructive.ts / gitTools.ts
    approval.ts                 registry pending approval untuk tool destruktif
    ompConfig.ts                tulis/hapus entry MCP di config omp
    tools.ts / index.ts         barrel registry (44 tool) + facade lifecycle
  utils/
    ipcSecurity.ts / ipcValidation.ts   validasi trusted IPC event + CHANNEL_RULES per channel
    logger.ts                   structured logging (userData/logs/main.log)
    logRotation.ts / logStore.ts / portCheck.ts / processTree.ts / pathKey.ts / versionCompare.ts
    messagesToMarkdown.ts       export percakapan agent ke Markdown
    workspaceBackup.ts / workspaceSearch.ts / updater.ts

src/                           TypeScript strict
  App.tsx                       controller tipis — orchestration dipindah ke hooks/modul
  i18n/                         translations.ts (en/id) + I18nContext.tsx (useI18n().t)
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

tests/                          harness saja (setup + mock electron/node-pty + fixture mock omp)
e2e/                            15 spec Playwright (29 test) terhadap app Electron yang di-build
```

Test unit berada di `__tests__/` bersebelahan dengan kode yang diuji, bukan terpusat di `tests/`.

## Main Process Lifecycle

`main.ts` sengaja dijaga tipis — `initialize()` hanya merangkai, bukan mengimplementasi:

1. Single instance lock (`requestSingleInstanceLock`); instance kedua memfokuskan window yang ada lalu keluar.
2. CSP diterapkan, reset data tertunda diproses, menu + crash reporter dipasang.
3. Managers dibuat dan storage diinisialisasi.
4. BrowserWindow dibuat (frameless di Windows/Linux, native frame di macOS).
5. Auto-updater, tray, dan global shortcut `Ctrl/Cmd+Shift+Space` didaftarkan.
6. PreviewManager + CredentialManager, lalu MCP manager (autostart hanya bila `agent.controlEnabled`).
7. Seluruh handler IPC didaftarkan, disusul notifikasi dan auto-start project.
8. Development memuat dev server (`VITE_DEV_PORT`, default 5173); production memuat `dist-react/index.html`.
9. `before-quit` mencegah exit sementara, menghentikan semua process aktif dan terminal PTY, lalu `app.exit(0)`.

Jika storage gagal diinisialisasi, app mencatat error dan quit.

Dua perilaku yang mudah salah diubah:

- **Handler `close` window harus sinkron.** Minimize-to-tray membaca `config.minimizeToTray` dari cache (`currentConfig`) — pembacaan async akan membuat window telanjur tertutup sebelum keputusan diambil.
- **Reset ke fresh install ditunda.** Handler menulis marker `.reset-pending`; penghapusan dilakukan pada startup berikutnya (`utils/resetData.ts`) agar flush-on-quit milik manager tidak menulis ulang data yang baru dihapus.

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
- **VPS Command Center** — koneksi SSH dimiliki main process (`electron/managers/vps/`), satu koneksi persisten per server dengan channel `exec` per operasi dan channel `shell` untuk PTY. Secret SSH disimpan terenkripsi `safeStorage` di `vps-credentials.json` (tidak pernah ke renderer/backup). Host key adalah gate handshake: key tak dikenal → status `verifying-host` + review fingerprint di UI. Tool agent untuk VPS disajikan **hanya** dari endpoint MCP ter-scope (`/mcp/<scopeId>`): server target diikat ke endpoint (bukan argumen tool), token unik per scope, dan `.omp/mcp.json` project-scoped ditulis di context dir sesi lalu dihapus setelah omp membacanya. Kebijakan agent per server (`agent-disabled`/`read-only`/`controlled`) ditegakkan sebelum approval. Lihat [VPS_AUDIT.md](VPS_AUDIT.md) untuk keterbatasan (kebocoran kapabilitas token scope) sebelum mengaktifkan eksekusi remote di rilis.
- **MCP server agent-control (opt-in)** — HTTP server hand-rolled di `electron/mcp/` (`server.ts` bind `127.0.0.1` saja + token Bearer acak per-launch, rate limit 120 req/10 s, max payload 512 KB, 16 in-flight; `tools*.ts` registri **44 tool** dengan kategori `read`/`write`/`destructive`; `approval.ts` + `McpApprovalModal` — tool destruktif menunggu persetujuan user; config `agent.controlEnabled` + matriks izin `agent.permissions`; entry omp di `~/.omp/agent/mcp.json`). Detail: `docs/MCP_API.md` dan `docs/ROADMAP_AGENT_MCP.md`.

## Technical Debt Utama

- IPC response shapes sebagian masih mengembalikan bentuk langsung alih-alih wrapper `{ success }` (konsolidasi bertahap lewat `safeHandle`) — lihat catatan Convention di [IPC_API.md](IPC_API.md).
- File test (`__tests__`) masih `.js`/`.jsx` — sengaja dikecualikan dari tsconfig; dapat dikonversi ke TS bila diperlukan.
- `noUncheckedIndexedAccess` belum diaktifkan (opsional — evaluasi per folder).
- **Threshold coverage jauh di bawah angka terukur** — `vitest.config.js` mematok statements/lines 28%, functions 32%, branches 60%, sedangkan coverage aktual jauh lebih tinggi. Floor serendah ini tidak menangkap regresi; naikkan mendekati baseline nyata.
- **9 warning lint (0 error)** — 7 `max-lines` pada file yang melewati batas 400 baris (`max-lines` dihitung tanpa baris kosong/komentar): `electron/utils/ipcValidation.ts`, `electron/preload.ts`, `electron/main.ts`, `electron/managers/OmpManager.ts`, `src/components/Modals/ProjectModal.tsx`, `src/components/Settings/OmpSettingsCard.tsx`, dan satu file test (`electron/managers/__tests__/previewManager.test.js`). Sisanya 2 `no-unused-vars` di file test. Rule-nya masih `warn`, jadi batas ini tidak pernah memblokir CI.
- Dokumentasi di `docs/` hanya Bahasa Indonesia, sementara README bilingual — kontributor non-Indonesia berhenti di level arsitektur.

Prioritas dan acceptance criteria tersedia di [Roadmap](ROADMAP.md).
