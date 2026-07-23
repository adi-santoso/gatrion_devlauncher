# IPC API

Dokumen ini mencatat kontrak yang benar-benar diekspos oleh `electron/preload.js`. Semua method tersedia sebagai `window.electron` hanya di Electron mode.

## Convention

Sebagian besar mutation mengembalikan:

```js
{ success: true, ...data }
// atau
{ success: false, error: 'message' }
```

Kontrak belum seragam. `getProcessStatus()` mengembalikan status object langsung dan `startAllProjects()` mengembalikan array.

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

### `startProject(projectId, projectPath, command, env)`

Channel: `start-project`

```js
{ success: true, pid: 1234 }
{ success: false, error: '...' }
```

`env` object di-merge ke `process.env`. Command dijalankan melalui shell.

### `stopProject(projectId)`

Channel: `stop-project`

Renderer bridge tidak mengekspos parameter `force`, walau handler menerima argumen internal opsional.

```js
{ success: true, forced: false }
{ success: true, forced: true }
{ success: false, error: '...' }
```

Status `STOPPING` dikirim sebelum promise selesai.

### `restartProject(projectId, projectPath, command, env)`

Channel: `restart-project`

Jika process `RUNNING`, backend stop, tunggu satu detik, lalu start ulang.

```js
{ success: true, pid: 1234 }
{ success: false, error: '...' }
```

### `startAllProjects()`

Channel: `start-all-projects`

Preload tidak mengirim daftar, sehingga handler membaca project dari storage. Project tanpa `startCommand`/`command` dilewati dan tidak masuk results.

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
  error: undefined
}
```

Unknown project:

```js
{ status: 'STOPPED', logs: [] }
```

Backend juga mendaftarkan `get-logs` dan `clear-logs`, tetapi preload belum mengeksposnya. `useProcesses.getLogs/clearLogs` hanya bekerja pada state frontend.

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

## Browser Fallback

`src/utils/ipcRenderer.js` menyediakan mock untuk browser mode. Batasannya:

- add/update/delete tidak persisten setelah reload;
- process lifecycle hanya mengembalikan status mock;
- event subscriptions no-op;
- browse folder gagal dengan pesan khusus;
- detector selalu mengembalikan mock React.

Browser mode untuk development visual, bukan integration testing.
