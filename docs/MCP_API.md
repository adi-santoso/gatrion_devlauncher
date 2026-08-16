# MCP API — DevLauncher

> **Referensi lengkap server MCP DevLauncher** (44 tool, 3 kategori izin). Dokumen ini di-generate
> dari definisi tool di `electron/mcp/tools*.ts` — jika ada perbedaan dengan kode, kode adalah acuan.
>
> Konteks fitur & keputusan desain: [docs/ROADMAP_AGENT_MCP.md](ROADMAP_AGENT_MCP.md) (D1–D9).

Fitur "Agent dapat mengontrol DevLauncher" (Settings, default **off**) menjalankan server MCP lokal.
Agent chat (omp / oh-my-pi) yang terhubung bisa **melihat project, menjalankan perintah, operasi git,
npm, terminal, preview, backup, update aplikasi** — semuanya tercatat di activity feed dan main.log.

---

## 1. Ringkasan

| Aspek | Nilai |
|---|---|
| Transport | HTTP (Streamable HTTP), satu endpoint `POST /mcp` |
| Protokol | JSON-RPC 2.0, MCP `2025-11-25` |
| Bind address | `127.0.0.1` saja (port acak per launch) |
| Auth | `Authorization: Bearer <token>` — token acak per launch, tidak pernah di-log |
| Methods | `initialize`, `notifications/initialized`, `tools/list`, `tools/call`, `ping` |
| Tool | **44** — read **9**, write **27**, destructive **8** |
| Approval | Tool destructive menunggu keputusan user via modal (timeout 120 s) |
| Audit | Semua call dicatat (activity feed + main.log, args ter-redaksi) |

```
┌────────────────────────── DevLauncher (proses GUI) ─────────────────────────┐
│  Renderer (React) ◄── IPC ──► main process                                  │
│  Chat UI (tool card)              │                                          │
│       ▲                           ├─ Managers (ProcessManager, StorageManager,│
│       │ tool_execution_* events   │   RepoManager, PreviewManager, ...)      │
│       │                           ├─ MCP Server (127.0.0.1:<port>)  ──┐      │
│  ┌────┴────────────────────┐      │   - tools*.ts (registri 44 tool)   │      │
│  │ omp --mode rpc          │      │   - auth (token per-launch)        │      │
│  │ (agent per project)     │◄─────┼─ MCP client (bawaan omp) ◄─────────┘      │
│  │ cwd = folder project    │  HTTP│                                        │
│  └─────────────────────────┘      │   config: ~/.omp/agent/mcp.json       │
└──────────────────────────────────┴─────────────────────────────────────────┘
```

---

## 2. Koneksi & Keamanan

### 2.1 Endpoint & auth

- Server hanya mendengar di `127.0.0.1:<port-acak>`; request dari address lain → **403**.
- Setiap request wajib membawa header `Authorization: Bearer <token>`; tanpa/header salah → **401**.
- Token di-generate acak (32 byte hex) **setiap launch**, disimpan hanya di config omp
  (`~/.omp/agent/mcp.json`), tidak pernah dikembalikan lewat IPC (`mcp-status` hanya memberi
  `{ running, port }`) dan tidak pernah di-log (D2).

### 2.2 Config omp (cara agent menemukan server)

DevLauncher menulis/memperbarui satu entry `devlauncher` di config user-level omp:

```jsonc
// ~/.omp/agent/mcp.json   (Windows: %USERPROFILE%\.omp\agent\mcp.json)
{
  "mcpServers": {
    "devlauncher": {
      "type": "http",
      "url": "http://127.0.0.1:<port>/mcp",
      "headers": { "Authorization": "Bearer <token>" },
      "timeout": 120000
    }
  }
}
```

- `timeout: 120000` — tool destructive butuh waktu menunggu keputusan user (D4).
- Saat fitur dimatikan / app quit, entry dihapus; jika tidak ada server lain, file dihapus.
- Tool MCP muncul di agent dengan prefix `mcp__devlauncher__<tool>` (contoh: `mcp__devlauncher__devlauncher_git_status`).

### 2.3 Inisialisasi (client manual)

```bash
# Ambil port & token dari config omp, lalu:
curl -s http://127.0.0.1:<port>/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

`initialize` mengembalikan `protocolVersion` sesuai yang diminta, `capabilities.tools`, dan
`serverInfo { name: "devlauncher", version: "<versi app>" }`. Setelah itu kirim
`notifications/initialized`, lalu `tools/list` untuk melihat 44 tool + skema args-nya.

---

## 3. Batasan Server (boundary MCP)

Diterapkan di `electron/mcp/server.ts`, **sebelum** request diproses:

| Batasan | Nilai | Respons |
|---|---|---|
| Rate limit (sliding window per address) | 120 request / 10 detik | `429` + header `Retry-After` |
| Ukuran body maksimal (`tools/call`) | 512 KB (dicek via `content-length` *dan* saat buffering) | `413` |
| Request concurrent (in-flight) | maksimal 16 | `429` |
| Method HTTP | `POST /mcp` (GET → info endpoint, tanpa SSE) | selain itu `405` |
| Path | `/mcp` | selain itu `404` |

Error JSON-RPC (dikembalikan dengan HTTP 200, sesuai spek): `-32700` Parse error,
`-32600` Invalid Request, `-32601` Method not found, `-32602` Invalid params.

---

## 4. Format Respons `tools/call`

`tools/call` **tidak pernah** gagal di level HTTP — hasil operasi dikembalikan sebagai konten text:

```jsonc
// Sukses
{ "jsonrpc": "2.0", "id": 1, "result": { "content": [{ "type": "text", "text": "{\"success\":true,...}" }], "isError": false } }

// Gagal (tool tidak dikenal, izin dimatikan, ditolak user, error handler)
{ "jsonrpc": "2.0", "id": 1, "result": { "content": [{ "type": "text", "text": "<pesan error>" }], "isError": true } }
```

Pola error umum (pesan di `text`): `projectId is required`, `Project <id> not found`,
`Permission denied: <kategori> tools are disabled in Settings`, `User menolak operasi ini`,
`Approval timed out — user did not respond`, `Unknown tool: <name>`.

---

## 5. Alur Approval (tool destructive)

Semua tool kategori **destructive** tidak langsung dieksekusi (D6):

1. Agent memanggil tool destructive → request **di-parkir** (belum dieksekusi).
2. Modal konfirmasi muncul di renderer: label aksi, nama project, ringkasan, tool + args
   (nilai secret selalu dimask `***`).
3. **Approve** → tool dieksekusi. **Deny** → agent menerima error `User menolak operasi ini`.
4. **Timeout 120 s** tanpa respons → auto-deny. Window tidak tersedia → deny instan
   (call tidak pernah menggantung).
5. Request approval beruntun di-antre di modal (ada tombol **Deny all**).
6. Setiap keputusan (approve/deny/timeout) dicatat di activity feed + main.log.

---

## 6. Katalog Tool

Legenda kategori izin (Settings → matriks izin, default semua aktif):

| Kategori | Konfirmasi | Dicatat | Contoh |
|---|---|---|---|
| **read** | tidak | ya (ringkas) | lihat status project, log, git status |
| **write** | tidak | ya (args ter-redaksi) | start/stop, git, npm, terminal, .env |
| **destructive** | **wajib** (modal) | ya (args ter-redaksi + keputusan) | hapus project, force stop, backup, update |

> ⚠️ **Penting:** args di-pasang dari `inputSchema`. Field selain yang terdaftar ditolak
> (`additionalProperties: false`), dan field bertipe salah akan ditolak oleh schema.

### 6.1 Tool Read (9)

#### `devlauncher_list_projects`
Daftar semua project + status runtime.
- **Args:** tidak ada.
- **Return:** array project aman (id, name, path, type, port, startCommand, autoStart, tags, commands,
  customCommands, status `{ status, pid, exitCode, message }`). Nilai env/secret **tidak pernah** disertakan (D8).

#### `devlauncher_get_project`
Detail satu project + ringkasan health.
- **Args:** `projectId` (string, wajib).
- **Return:** `{ project: <safe project>, health: { totalRuns, totalUptimeMs, crashes } | null }`.

#### `devlauncher_get_project_logs`
Tail log runtime project.
- **Args:** `projectId` (wajib), `limit` (number 1–500, default 100).
- **Return:** log (baris terbaru di akhir).

#### `devlauncher_git_status`
Status git repo project.
- **Args:** `projectId` (wajib).
- **Return:** `{ isRepo, branch, upstream, ahead, behind, staged[], unstaged[], untracked[] }`.
  Label perubahan: `added/modified/deleted/renamed/copied/unmerged/type change/untracked`.
  Bukan repo → `isRepo: false` dengan array kosong.

#### `devlauncher_get_app_config`
Config aplikasi (tema, bahasa, notifikasi, terminal, auto-restart, preview, agent) — **tanpa secret**.
- **Args:** tidak ada.
- **Return:** config tanpa `windowBounds` & `schemaVersion`.

#### `devlauncher_get_presets`
Daftar preset workspace.
- **Args:** tidak ada.
- **Return:** array preset (id, name, projectIds).

#### `devlauncher_get_health`
Analitik kesehatan project (riwayat run, crash, uptime, tren CPU/memori).
- **Args:** `projectId` (wajib).
- **Return:** objek stats dari HealthManager (atau `null` jika belum ada data).

#### `devlauncher_preview_read_console`
Baca pesan console terbaru dari preview embedded project (agent bisa melihat error runtime).
- **Args:** `projectId` (wajib), `limit` (number 1–500, default 50).
- **Return:** buffer pesan console (errors/warnings/logs).

#### `devlauncher_update_check`
Cek ketersediaan versi baru DevLauncher (packaged build saja).
- **Args:** tidak ada.
- **Return:** `{ success, error?, state }` dari state machine electron-updater.
- **Catatan:** kategori **read** (tanpa modal) — hanya mengecek, tidak mengunduh/menginstall.

### 6.2 Tool Write (27)

#### Lifecycle project

#### `devlauncher_start_project`
Menjalankan command start project.
- **Args:** `projectId` (wajib).
- **Return:** hasil `startProcess` (success, pid, dll).

#### `devlauncher_stop_project`
Stop project (graceful; `force: true` kill seketika).
- **Args:** `projectId` (wajib), `force` (boolean, default false).
- **Return:** hasil `stopProcess`.

#### `devlauncher_restart_project`
Restart project.
- **Args:** `projectId` (wajib).
- **Return:** hasil `restartProcess`.

#### `devlauncher_start_all_projects`
Start beberapa / semua project sekaligus, menghormati dependency (`dependsOn`), opsional stagger.
- **Args:** `projectIds` (array string, opsional — kosong = semua), `delayMs` (number 0–60000, default 0).
- **Return:** `{ started, failed, results: [{ projectId, success, error? }] }`.

#### `devlauncher_stop_all_projects`
Stop semua project yang berjalan.
- **Args:** tidak ada.
- **Return:** hasil `stopAllProcesses`.

#### `devlauncher_apply_preset`
Start semua project dalam preset tersimpan.
- **Args:** `presetId` (wajib, dari `devlauncher_get_presets`).
- **Return:** `{ preset: <nama>, started, results }`.

#### Git

#### `devlauncher_git_stage`
Stage file (kosongkan `files` untuk stage semua perubahan).
- **Args:** `projectId` (wajib), `files` (array string, opsional; maks 500).
- **Return:** `{ success: true }`.

#### `devlauncher_git_unstage`
Unstage file (kosongkan `files` untuk reset index).
- **Args:** `projectId` (wajib), `files` (array string, opsional; maks 500).
- **Return:** `{ success: true }`.

#### `devlauncher_git_commit`
Commit perubahan yang sudah di-stage.
- **Args:** `projectId` (wajib), `message` (string, wajib, maks 2000 karakter).
- **Return:** `{ success: true, output }`.

#### `devlauncher_git_checkout`
Pindah branch (atau buat baru dengan `createNew: true`).
- **Args:** `projectId` (wajib), `branch` (wajib, ≤200 karakter, hanya `\w./-`), `createNew` (boolean, default false).
- **Return:** `{ success: true }`.
- **Error:** nama branch invalid, checkout gagal (working tree kotor, dll).

#### `devlauncher_git_pull`
`git pull` repo project (timeout 90 s, prompt terminal nonaktif).
- **Args:** `projectId` (wajib).
- **Return:** `{ success: true, output }`.

#### `devlauncher_git_push`
`git push` repo project (timeout 90 s).
- **Args:** `projectId` (wajib).
- **Return:** `{ success: true, output }`.

#### `devlauncher_git_stash`
`git stash push` (opsional pesan).
- **Args:** `projectId` (wajib), `message` (opsional, ≤200 karakter).
- **Return:** `{ success: true, output }`.

#### `devlauncher_git_stash_pop`
`git stash pop` (opsional index).
- **Args:** `projectId` (wajib), `index` (number 0–1000, default 0).
- **Return:** `{ success: true, output }`.

#### `devlauncher_git_discard`
Buang perubahan working-tree satu file (`git checkout -- <file>`).
- **Args:** `projectId` (wajib), `file` (string, wajib).
- **Return:** `{ success: true }`.
- **Catatan:** destructive pada level repo, tapi kategori **write** (tidak butuh modal).

#### NPM

#### `devlauncher_npm_install`
`npm install` di project.
- **Args:** `projectId` (wajib).
- **Return:** `{ success: true, output }` (output dipotong 2000 karakter terakhir).

#### `devlauncher_npm_update`
`npm update <packageName>` di project.
- **Args:** `projectId` (wajib), `packageName` (wajib, ≤200 karakter).
- **Return:** `{ success: true, output }`.

#### `devlauncher_run_project_script`
Jalankan script `package.json`.
- **Args:** `projectId` (wajib), `script` (wajib, ≤100 karakter).
- **Return:** `{ success: true, output }`.

#### Terminal (PTY)

#### `devlauncher_terminal_create`
Buka terminal PTY asli di folder project (shell: `powershell.exe` di Windows, default di OS lain).
- **Args:** `projectId` (wajib).
- **Return:** `{ success: true, id: <terminalId>, cwd }` — `terminalId` dipakai tool terminal lain.

#### `devlauncher_terminal_input`
Tulis input ke terminal (termasuk newline untuk menjalankan perintah).
- **Args:** `terminalId` (wajib), `data` (string, wajib).
- **Return:** hasil `terminalApi.input`.

#### `devlauncher_terminal_kill`
Tutup terminal.
- **Args:** `terminalId` (wajib).
- **Return:** hasil `terminalApi.kill`.

#### Preview

#### `devlauncher_preview_open`
Tampilkan preview embedded project.
- **Args:** `projectId` (wajib), `url` (opsional — default `http://localhost:<port project>`).
- **Return:** `{ success: true, url }`.
- **Error:** project tanpa port dan tanpa `url` eksplisit.

#### `devlauncher_preview_reload`
Reload preview embedded.
- **Args:** `projectId` (wajib).
- **Return:** `{ success: true }`.

#### `devlauncher_preview_navigate`
Navigasi preview ke URL.
- **Args:** `projectId` (wajib), `url` (wajib, ≤4000 karakter).
- **Return:** `{ success: true }`.

#### Env / Config / Activity

#### `devlauncher_env_write`
Merge entri ke file `.env` project (key baru ditambahkan, key lama di-update).
- **Args:** `projectId` (wajib), `entries` (array `{ key, value }`, wajib, 1–100 entri;
  key harus `^[A-Za-z_][A-Za-z0-9_]*$`).
- **Return:** `{ success: true, writtenKeys: string[] }`.
- **Catatan (D8):** nilai **tidak pernah** di-echo kembali ke agent — hanya nama key yang dikembalikan;
  di audit/log juga dimask `***`.

#### `devlauncher_config_update`
Update setting aman aplikasi (whitelist key, tanpa modal).
- **Args (semua opsional):**
  - `theme`: `dark | light | system`
  - `language`: `en | id`
  - `sidebarExpanded`: boolean
  - `notifications`: `{ onStart?, onError?, sound? }`
  - `terminal`: `{ fontSize?, maxLines?, autoScroll? }`
- **Return:** `{ success: true }`; config baru di-broadcast ke UI (`config-updated`).
- **Error:** nilai enum tidak valid (`invalid theme`, `invalid language`).

#### `devlauncher_append_activity`
Tulis entri ke activity feed (agent mencatat aksinya sendiri).
- **Args:** `message` (wajib, ≤200 karakter), `detail` (opsional, ≤1000 karakter).
- **Return:** `{ success: true }`.

### 6.3 Tool Destructive (8) — wajib persetujuan user

> Semua tool di bawah ini **tidak dieksekusi sebelum user approve** di modal (lihat §5).

#### `devlauncher_delete_project`
Hapus project dari workspace (stop dulu jika running). **File di disk TIDAK dihapus.**
- **Args:** `projectId` (wajib).
- **Return:** `{ success: true, deleted: <id>, name }`; UI di-refresh (`projects-updated`).
- **Error:** project sedang `stopping` → tidak bisa dihapus saat itu.

#### `devlauncher_force_stop_project`
Stop paksa project seketika (SIGKILL / `taskkill /F`).
- **Args:** `projectId` (wajib).
- **Return:** hasil `stopProcess(force=true)`.
- **Catatan:** prefer `devlauncher_stop_project` untuk stop graceful.

#### `devlauncher_backup_export`
Ekspor seluruh workspace (project **termasuk nilai env**, config, preset, health) ke file JSON
di folder Documents, opsional dienkripsi AES.
- **Args:** `password` (opsional — jika diisi, bundle dienkripsi).
- **Return:** `{ success: true, filePath, encrypted, projectCount }` — **hanya path file**;
  isi bundle (mengandung secret .env) **tidak pernah** dikembalikan ke agent (D8).
- **Nama file:** `DevLauncher-backup-<timestamp>.json`.

#### `devlauncher_backup_import`
Import bundle backup (string JSON, opsional terenkripsi) dan **merge** ke workspace —
data yang sudah ada **tidak pernah ditimpa**.
- **Args:** `bundle` (string, wajib, maks 10 MB), `password` (opsional, jika bundle terenkripsi).
- **Return:** `{ success: true, wasEncrypted, added, skipped, configUpdated, presetsAdded }`.

#### `devlauncher_update_download_install`
Unduh update yang tersedia (jika belum) lalu **restart DevLauncher untuk install**.
- **Args:** tidak ada.
- **Return:** hasil `quitAndInstall` (app langsung restart).
- **Error:** auto-update tidak tersedia di build ini (dev/portable tanpa feed).

#### `devlauncher_clear_health`
Hapus analitik kesehatan (riwayat run, crash, tren resource) satu project.
- **Args:** `projectId` (wajib).
- **Return:** `{ success: true, cleared: <id> }`.

#### `devlauncher_clear_crash_dumps`
Hapus semua file crash dump lokal (`.dmp`) di folder crashDumps.
- **Args:** tidak ada.
- **Return:** `{ success: true, cleared: <jumlah file> }`.

#### `devlauncher_config_update_destructive`
Update setting sensitif aplikasi **dan terapkan OS settings** (mis. login item untuk startOnBoot).
- **Args (semua opsional, minimal satu wajib):**
  - `startOnBoot`: boolean
  - `autoStartProjects`: boolean
  - `minimizeToTray`: boolean
  - `autoRestart`: `{ enabled?, maxRetries?, delayMs? }`
- **Return:** `{ success: true, updated: string[] }`.
- **Error:** tidak ada setting valid yang diberikan.

---

## 7. Tabel Ringkas (44 Tool)

| Tool | Kategori | Argumen wajib | Deskripsi singkat |
|---|---|---|---|
| `devlauncher_list_projects` | read | — | Daftar project + status |
| `devlauncher_get_project` | read | projectId | Detail project + health |
| `devlauncher_get_project_logs` | read | projectId | Tail log runtime |
| `devlauncher_git_status` | read | projectId | Status git repo |
| `devlauncher_get_app_config` | read | — | Config aplikasi (tanpa secret) |
| `devlauncher_get_presets` | read | — | Daftar preset |
| `devlauncher_get_health` | read | projectId | Analitik kesehatan project |
| `devlauncher_preview_read_console` | read | projectId | Console preview embedded |
| `devlauncher_update_check` | read | — | Cek versi update tersedia |
| `devlauncher_start_project` | write | projectId | Start project |
| `devlauncher_stop_project` | write | projectId | Stop project (graceful/force) |
| `devlauncher_restart_project` | write | projectId | Restart project |
| `devlauncher_start_all_projects` | write | — | Start banyak/semua project |
| `devlauncher_stop_all_projects` | write | — | Stop semua project |
| `devlauncher_apply_preset` | write | presetId | Start project dalam preset |
| `devlauncher_git_stage` | write | projectId | Stage file |
| `devlauncher_git_unstage` | write | projectId | Unstage file |
| `devlauncher_git_commit` | write | projectId, message | Commit perubahan |
| `devlauncher_git_checkout` | write | projectId, branch | Pindah/buat branch |
| `devlauncher_git_pull` | write | projectId | git pull |
| `devlauncher_git_push` | write | projectId | git push |
| `devlauncher_git_stash` | write | projectId | git stash push |
| `devlauncher_git_stash_pop` | write | projectId | git stash pop |
| `devlauncher_git_discard` | write | projectId, file | Buang perubahan 1 file |
| `devlauncher_npm_install` | write | projectId | npm install |
| `devlauncher_npm_update` | write | projectId, packageName | npm update paket |
| `devlauncher_run_project_script` | write | projectId, script | Jalankan npm script |
| `devlauncher_terminal_create` | write | projectId | Buka PTY terminal |
| `devlauncher_terminal_input` | write | terminalId, data | Tulis input terminal |
| `devlauncher_terminal_kill` | write | terminalId | Tutup terminal |
| `devlauncher_preview_open` | write | projectId | Tampilkan preview |
| `devlauncher_preview_reload` | write | projectId | Reload preview |
| `devlauncher_preview_navigate` | write | projectId, url | Navigasi preview |
| `devlauncher_env_write` | write | projectId, entries | Merge ke .env |
| `devlauncher_config_update` | write | — | Update setting aman |
| `devlauncher_append_activity` | write | message | Tulis activity feed |
| `devlauncher_delete_project` | destructive | projectId | Hapus dari workspace |
| `devlauncher_force_stop_project` | destructive | projectId | Stop paksa (SIGKILL) |
| `devlauncher_backup_export` | destructive | — | Backup workspace ke file |
| `devlauncher_backup_import` | destructive | bundle | Merge backup |
| `devlauncher_update_download_install` | destructive | — | Download + install update |
| `devlauncher_clear_health` | destructive | projectId | Hapus data kesehatan |
| `devlauncher_clear_crash_dumps` | destructive | — | Hapus crash dump |
| `devlauncher_config_update_destructive` | destructive | — | Setting sensitif + OS |

---

## 8. Matriks Izin (Settings)

Config `agent.permissions` (default semua `true`):

```jsonc
{ "agent": { "permissions": { "read": true, "write": true, "destructive": true } } }
```

- Toggle per kategori di Settings → "Agent dapat mengontrol DevLauncher" (muncul saat fitur aktif).
- Kategori yang dimatikan → `tools/call` langsung dikembalikan dengan
  `Permission denied: <kategori> tools are disabled in Settings` (diuji unit + e2e).
- Fitur utama mati (`controlEnabled: false`) → server MCP tidak start + entry config omp dihapus.

---

## 9. Audit Trail

Setiap `tools/call` tercatat (D7), tanpa terkecuali:

- **Activity feed** — read: `Agent (MCP) membaca <tool>`; write/destructive:
  `Agent (MCP) menjalankan <tool>` + detail (args ter-redaksi).
- **main.log** — `tool=<name> permission=<kategori> durationMs=<ms> args=<redacted> detail=<...>`.
- **Redaksi secret** — key berisi `password|passwd|secret|token|api[_-]?key|authorization` → `***`;
  entri `.env` (`entries`) → hanya key yang terlihat, value `***`.
- Kegagalan audit tidak pernah menggagalkan tool call (best-effort).

---

## 10. Implementasi di Kode

| File | Isi |
|---|---|
| `electron/mcp/tools.ts` | Barrel registry (merakit 44 tool) |
| `electron/mcp/toolsRead.ts` | 9 tool read |
| `electron/mcp/toolsWrite.ts` | 18 tool write (lifecycle, git, npm) |
| `electron/mcp/toolsWriteMisc.ts` | 9 tool write (terminal, preview, env, config, activity) |
| `electron/mcp/toolsDestructive.ts` | 8 tool destructive + `update_check` (read) |
| `electron/mcp/toolsShared.ts` | Tipe `McpTool`, dispatch, permission matrix, audit |
| `electron/mcp/gitTools.ts` | Operasi git (porcelain, fail-fast) |
| `electron/mcp/server.ts` | HTTP server, auth, rate limit, max payload |
| `electron/mcp/approval.ts` | State machine approval (modal, timeout 120 s) |
| `electron/mcp/ompConfig.ts` | Writer entry `~/.omp/agent/mcp.json` |
| `electron/mcp/index.ts` | Lifecycle start/stop + wiring approval sender |
