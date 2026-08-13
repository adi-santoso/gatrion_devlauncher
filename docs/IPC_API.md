# IPC API

Dokumen ini mencatat kontrak yang benar-benar diekspos oleh `electron/preload.js`. Semua method tersedia sebagai `window.electron` hanya di Electron mode.

## Convention

Sebagian besar mutation mengembalikan:

```js
{ success: true, ...data }
// atau
{ success: false, error: 'message' }
```

Kontrak belum seragam. `getProcessStatus()`, `getProcessMetrics()`, `getCustomCommandStatus()`, `checkPortConflict()`, dan `startAllProjects()`/`stopAllProjects()` mengembalikan bentuk langsung (bukan wrapper `{ success }`).

## Project API

### `getProjects()`

Channel: `get-projects`

```js
{ success: true, projects: [] }
{ success: false, error: '...', projects: [] }
```

### `addProject(projectData)`

Channel: `add-project`

Backend mewajibkan `name`, `path`, truthy `port`, dan `startCommand`. Backend menolak nama case-insensitive duplicate dan path duplicate.

```js
{ success: true, project }
{ success: false, error: '...' }
```

Backend dapat menambahkan `id`, `createdAt`, dan `lastRun` langsung ke object input.

### `updateProject(projectId, updates)`

Channel: `update-project`

```js
{ success: true, project }
{ success: false, error: '...' }
```

Update hanya menerima field persisted yang di-allowlist. ID dan runtime field tidak dapat diubah. Full project hasil merge divalidasi sebelum disimpan.

### `deleteProject(projectId)`

Channel: `delete-project`

Jika process sedang `RUNNING`, backend menghentikannya lebih dulu. Delete ditolak ketika `STARTING` atau `STOPPING`.

```js
{ success: true }
{ success: false, error: '...' }
```

### `browseFolder()`

Channel: `browse-folder`

```js
{ success: true, path: 'D:/projects/app' }
{ success: false, canceled: true }
{ success: false, error: '...' }
```

### `detectProjectType(projectPath)`

Channel: `detect-project-type`

```js
{
  success: true,
  type: 'REACT_VITE',
  name: 'React (Vite)',
  defaultCommand: 'npm run dev',
  defaultPort: 5173,
  icon: '⚛️',
  color: '#61DAFB'
}
```

Path tidak valid:

```js
{ success: false, error: 'Project directory does not exist' }
```

## Process API

### `startProject(projectId)`

Channel: `start-project`

```js
{ success: true, pid: 1234 }
{ success: false, error: '...' }
```

Main process mengambil path, command, port, dan environment dari project yang sudah divalidasi di storage. Renderer tidak dapat menentukan command eksekusi. Environment project di-merge ke `process.env` dan command tersimpan dijalankan melalui shell.

### `stopProject(projectId, force)`

Channel: `stop-project`

`force` diekspos di preload (default `false`) dan diteruskan ke `ProcessManager.stopProcess`.

```js
{ success: true, forced: false }
{ success: true, forced: true }
{ success: false, error: '...' }
```

Status `STOPPING` dikirim sebelum promise selesai.

### `restartProject(projectId)`

Channel: `restart-project`

Jika process `RUNNING`, backend stop, tunggu satu detik, lalu start ulang memakai konfigurasi terbaru dari storage.

```js
{ success: true, pid: 1234 }
{ success: false, error: '...' }
```

### `startAllProjects()`

Channel: `start-all-projects`

Handler selalu membaca project dari storage dan mengabaikan object project tambahan dari caller. Project yang gagal dijalankan tetap masuk ke results dengan `success: false`.

```js
[
  { projectId: 'id-1', success: true, pid: 1234 },
  { projectId: 'id-2', success: false, error: '...' }
]
```

### `stopAllProjects()`

Channel: `stop-all-projects`

```js
{ success: true }
{ success: false, error: '...' }
```

### `getProcessStatus(projectId)`

Channel: `get-process-status`

```js
{
  status: 'RUNNING',
  pid: 1234,
  startedAt: 1710000000000,
  logs: [],
  exitCode: undefined,
  error: undefined,
  port: 5173,
  commands: [{ id, name, command, port, primary, status, pid, ready }]
}
```

Unknown project:

```js
{ status: 'STOPPED', logs: [] }
```

### `getLogs(projectId, limit)` / `clearLogs(projectId)`

Channel: `get-logs` / `clear-logs`

`getLogs` mengembalikan array log terbaru (default 1000 entry, dibatasi `maxLogLines`). `clearLogs` mengosongkan buffer in-memory dan file `.jsonl` yang dipersist.

```js
// get-logs
[{ id: 1, timestamp: 'ISO', type: 'stdout', message: '...', commandId: null, commandName: null }]
// clear-logs
{ success: true }
```

### `getProcessMetrics(projectId)`

Channel: `get-process-metrics`

```js
{ status: 'running', pid: 1234, uptime: '5m 32s', uptimeSec: 332, memoryMb: 128, cpuPercent: 5.2 }
```

### `runCustomCommand(projectId, commandId)` / `stopCustomCommand(runId)` / `getCustomCommandStatus(runId)`

Channel: `run-custom-command` / `stop-custom-command` / `get-custom-command-status`

Menjalankan perintah one-off dari `project.customCommands`. Output dialirkan ke buffer log project yang sama. Tidak ada readiness/status tracking; gunakan `getCustomCommandStatus` untuk cek run id. Semua custom command dihentikan saat app quit.

```js
// run-custom-command
{ success: true, runId: 1, pid: 5678 }
// stop-custom-command
{ success: true, runId: 1, forced: true }
// get-custom-command-status
{ runId: 1, pid: 5678, status: 'running' } // atau { runId, pid: null, status: 'stopped' }
```

### `checkPortConflict(port)`

Channel: `check-port-conflict`

```js
{ inUse: true, pid: 1234, processName: 'node.exe', isManaged: false, managedProjectName: null }
```

### `startAllProjects(projectIds)`

Channel: `start-all-projects`

Handler selalu membaca project dari storage dan mengurutkannya secara **topological** berdasarkan `dependsOn` (dependency start lebih dulu). Project yang bergantung pada project gagal start akan di-skip dengan error `Dependency ... failed to start`.

```js
[
  { projectId: 'id-db', success: true, pid: 1234 },
  { projectId: 'id-app', success: false, error: 'Dependency id-db failed to start' }
]
```

## Export / Import API

### `exportProjects()`

Channel: `export-projects`

Menampilkan dialog simpan dan menulis JSON portabel:

```json
{
  "app": "devlauncher",
  "type": "devlauncher-projects",
  "version": 1,
  "exportedAt": "ISO timestamp",
  "projects": []
}
```

```js
{ success: true, path: 'D:/backup/devlauncher-projects-2026-08-12.json', count: 3 }
{ success: false, canceled: true }
```

### `importProjects()`

Channel: `import-projects`

Menampilkan dialog buka, membaca file, memvalidasi/normalisasi tiap entry, lalu menggabungkan ke registry. Entry dengan path duplikat, nama duplikat, direktori tidak ada, atau data invalid **di-skip** (tidak menimpa project existing).

```js
{
  success: true,
  added: [{ id, name, path, ... }],
  skipped: [{ name: 'app', reason: 'path already exists' }]
}
{ success: false, canceled: true }
```

## Presets & Activities API

### `getPresets()` / `savePresets(presets)`

Channel: `get-presets` / `save-presets`

Preset disimpan wholesale di `presets.json`. `savePresets` menormalisasi dan menyimpan seluruh array (rename/reorder dilakukan renderer lalu dikirim penuh).

```js
{ success: true, presets: [{ id, name, projectIds: [], createdAt }] }
```

### `getActivities()` / `appendActivities(entries)`

Channel: `get-activities` / `append-activities`

Activity feed dipersist di `activities.json` (maksimal 50 entry).

```js
{ success: true, activities: [{ type, project, message, detail, timestamp }] }
```

## Config API

### `getConfig()`

Channel: `get-config`

```js
{ success: true, config }
```

Read error dikonversi StorageManager menjadi default config, jadi handler biasanya tetap sukses.

### `updateConfig(updates)`

Channel: `update-config`

Nested object di-deep-merge, array/value primitive diganti.

```js
{ success: true, config }
{ success: false, error: '...' }
```

## Events

Setiap subscription preload mengembalikan cleanup function yang hanya menghapus listener miliknya.

### `onProcessStatus(callback)`

Channel: `process-status`

```js
callback(projectId, {
  status: 'RUNNING',
  pid: 1234,
  startedAt: 1710000000000,
  logs: []
})
```

### `onProcessLog(callback)`

Channel: `process-log`

```js
callback(projectId, {
  timestamp: 'ISO timestamp',
  type: 'stdout', // stdout | stderr | error | system
  message: 'log text'
})
```

### `onProcessError(callback)`

Channel: `process-error`

```js
callback(projectId, 'error message')
```

### `onProcessExit(callback)`

Channel: `process-exit`

```js
callback(projectId, exitCode, signal)
```

`exitCode` dapat `null` saat terminated by signal. Renderer saat ini menganggap nilai selain `0` sebagai error kecuali status update stop menimpanya.

### `onProjectsUpdated(callback)`

Channel: `projects-updated`

```js
callback(projects)
```

Dipancarkan setelah add, update, dan delete.

### `removeAllListeners(channel)`

API tersedia, tetapi tidak direkomendasikan untuk komponen baru karena dapat menghapus listener milik consumer lain. Gunakan cleanup hasil subscription.

## AI Agent (oh-my-pi) API

Semua channel agent di bawah divalidasi `assertTrustedIpcEvent` dan menolak input tidak valid. Backend = `OmpManager` (RPC) + `OmpInstaller` + `OmpConfig`.

### `ompStatus()`

Channel: `omp-status`

```js
{ success: true, installed: true, version: 'v17.2.15', binaryPath: 'C:/.../omp.exe', configured: true }
```

### `ompListSessions(projectId)` / `ompCreateSession(projectId, title)` / `ompRenameSession(projectId, sessionId, title)` / `ompDeleteSession(projectId, sessionId)`

Channel: `omp-list-sessions` / `omp-create-session` / `omp-rename-session` / `omp-delete-session`

Metadata session disimpan di `userData/agent-sessions.json` (title, createdAt, lastActive, tokens, sessionPath) — isi percakapan tetap di file session omp.

```js
{ success: true, sessions: [{ id, title, createdAt, lastActive, tokens, sessionPath }] }
```

### `ompChat(projectId, cwd, message, { sessionId, sessionPath, images })`

Channel: `omp-chat`

Spawn RPC per project (lazy, cwd = folder project), buat/switch session, lalu kirim `prompt`. `message` dibatasi 20.000 karakter. `images` opsional — array `ImageContent` omp (`{ type: 'image', data: <base64>, mimeType: 'image/png' }`), maksimal 8 gambar dan tiap data base64 ≤ 12 MB, divalidasi di main process.

```js
{ success: true, sessionId: 's...', session }
{ success: false, error: 'omp is not installed' | 'No models available…' }
```

### `ompSteer(projectId, cwd, message)` / `ompAbort(projectId, cwd)`

Channel: `omp-steer` / `omp-abort`

Interupsi/arahkan turn yang sedang berjalan.

### `ompGetMessages(projectId, cwd, { sessionPath })`

Channel: `omp-get-messages`

Normalisasi defensif riwayat percakapan (string atau array block `{ type: 'text' }`).

```js
{ success: true, messages: [{ role: 'user' | 'assistant', content: '...' }] }
```

### `ompGetModels(projectId, cwd)` / `ompSetModel(projectId, cwd, provider, modelId)`

Channel: `omp-get-models` / `omp-set-model`

`omp-get-models` menormalisasi respons RPC `get_available_models` menjadi array datar — termasuk model dari provider dengan `discovery` (daftar model diambil saat runtime, tidak ada `models:` eksplisit di models.yml):

```js
{ success: true, models: [{ id: 'kiro-claude-sonnet-4.5', name: '...', provider: 'kreova', ... }] }
```

`omp-set-model` mengubah model aktif sesi (RPC `set_model`).

### `ompSetThinkingLevel(projectId, cwd, level)` / `ompGetState(projectId, cwd)`

Channel: `omp-set-thinking-level` / `omp-get-state`

`omp-set-thinking-level` menerima `off | minimal | low | medium | high | xhigh | max` (RPC `set_thinking_level`); `omp-get-state` mengembalikan state sesi RPC, termasuk `thinkingLevel` dan `sessionFile`:

```js
{ success: true, state: { thinkingLevel: 'off', sessionFile: '...', model: { provider, id }, ... } }
```

### Installer

| Method | Channel | Keterangan |
|---|---|---|
| `ompInstall()` | `omp-install` | Download binary ke `userData/omp/omp.exe` + verifikasi SHA256 |
| `ompInstallState()` | `omp-install-state` | Status saat ini (`idle/downloading/installed/error` + percent) |
| `ompCheckUpdate()` | `omp-check-update` | `{ latest, size }` dari GitHub release terbaru |
| `ompRunSetup()` | `omp-run-setup` | Buka wizard `omp setup` di console sendiri (detached) |
| `ompOpenDocs()` | `omp-open-docs` | Buka halaman docs provider |

### Konfigurasi (models.yml / config.yml)

| Method | Channel | Keterangan |
|---|---|---|
| `ompConfigGet()` | `omp-config-get` | `{ providers, defaultModel, configPath }` — key provider di-mask |
| `ompConfigSaveProvider(input)` | `omp-config-save-provider` | Merge provider ke `~/.omp/agent/models.yml` (backup `.bak-<ts>` otomatis); validasi nama/baseUrl |
| `ompConfigDeleteProvider(name)` | `omp-config-delete-provider` | Hapus provider dari models.yml (dengan backup) |
| `ompConfigSetDefault(modelRef)` | `omp-config-set-default` | Tulis `modelRoles.default` di config.yml (format `provider/model`) |

### Events

| Event | Channel | Bentuk |
|---|---|---|
| `onOmpEvent(callback)` | `omp-event` | `callback({ projectId, event })` — event RPC omp: `message_update` (`assistantMessageEvent.delta`), `tool_execution_start/update/end`, `agent_start`, `agent_end` (berisi `messages` transkrip), `rpc_error`/`rpc_exit` |
| `onOmpInstallProgress(callback)` | `omp-install-progress` | `callback(state)` — `{ status, phase, received, total, percent, error, version }` |

## Browser Fallback

`src/utils/ipcRenderer.js` menyediakan mock untuk browser mode. Batasannya:

- add/update/delete tidak persisten setelah reload;
- process lifecycle hanya mengembalikan status mock;
- event subscriptions no-op;
- browse folder gagal dengan pesan khusus;
- detector selalu mengembalikan mock React.

Browser mode untuk development visual, bukan integration testing.
