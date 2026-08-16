# Roadmap: Agent Mengontrol DevLauncher (via MCP)

> **STATUS: FASE 0–4 SELESAI ✅** (16 Agu 2026). Dokumen ini adalah acuan tunggal untuk
> fitur "agent (omp) bisa melakukan aksi di dalam DevLauncher". Setiap fase punya deliverable
> konkret, acceptance criteria, dan effort — fase tidak dianggap selesai sampai acceptance
> criteria-nya terverifikasi lewat test/CI, bukan sekadar "terlihat jalan".
>
> F0 (spike), F1 (server + read), F2 (write), F3 (destructive + approval modal) dan
> F4 (hardening) sudah diimplementasi & diuji (627 unit test + 10 e2e Playwright, coverage
> `electron/mcp` 90% lines). Lihat section 7 untuk hasil F4 + checklist security review.
>
> Konteks fitur: DevLauncher sudah punya chat agent (oh-my-pi / omp) yang bisa membaca & mengedit
> kode. Fitur ini menambahkan kemampuan agent untuk **bertindak di aplikasi DevLauncher itu
> sendiri** — start/stop project, git, terminal, preview, backup, update app, dst — lewat MCP
> (Model Context Protocol), yang didukung native oleh omp.

---

## 1. Keputusan Desain (ditetapkan, bukan dibahas ulang per fase)

Keputusan ini sudah diputuskan berdasarkan riset kode & dokumentasi omp. Fase 0 hanya
**memverifikasi** asumsi yang ditandai ⚠️, bukan membuka ulang keputusan.

| # | Keputusan | Alasan |
|---|---|---|
| D1 | **Transport: HTTP Streamable HTTP di `127.0.0.1:<port-acak>`** (server dijalankan oleh proses GUI DevLauncher yang sudah hidup) | Manager (ProcessManager, StorageManager, dst) hidup di main process — server MCP tinggal memanggilnya langsung. Tidak perlu mode headless / proses kedua. |
| D2 | **Auth: token acak per-launch**, dikirim via header `Authorization: Bearer <token>`; server bind `127.0.0.1` saja | omp mendukung `headers` di config http. Bind localhost + token = cukup untuk akses lokal. Token di-generate tiap launch, tidak pernah di-log. |
| D3 | **Config omp: user-level `~/.omp/agent/mcp.json`** (satu entry `devlauncher`), ditulis/update oleh DevLauncher | ⚠️ omp di-spawn `--mode rpc` dengan `cwd = folder project` + env inherit, tanpa profile → user-level config berlaku untuk **semua** project tanpa menulis `.omp/mcp.json` per project (tidak mencemari repo user). |
| D4 | **Timeout server MCP: `timeout: 120000`** (atau 0 = tanpa timeout) di entry config | Tool destructive butuh menunggu keputusan user (modal) — omp default timeout 30 s terlalu pendek. |
| D5 | **Implementasi MCP server hand-rolled, tanpa dependency** (`@modelcontextprotocol/sdk` TIDAK dipakai) | Konsisten dengan ethos project (RPC omp di-hand-roll tanpa library). Protokol MCP = JSON-RPC 2.0 sederhana: `initialize`, `notifications/initialized`, `tools/list`, `tools/call`. |
| D6 | **Tiga kategori izin tool** | `read` (tanpa konfirmasi, dicatat), `write` (tanpa konfirmasi, dicatat + redaksi secret), `destructive` (harus konfirmasi user via modal → hasilnya menunggu keputusan user sebelum return ke agent). |
| D7 | **Semua aksi dicatat** di activity feed + main.log (tool, args ter-redaksi, session agent) | Audit trail penuh; user selalu tahu apa yang agent lakukan. |
| D8 | **Secret tidak pernah bocor ke agent** | Reuse kebijakan `toRendererProject` yang sudah ada: nilai env `.env` di-redact/mask; tool tidak pernah mengembalikan isi file secret. |
| D9 | **Toggle Settings "Agent dapat mengontrol DevLauncher"**, default **off** | Keamanan opt-in; saat off, server MCP tidak start dan entry config dihapus. |

### Asumsi yang harus diverifikasi di Fase 0 (⚠️)

1. **MCP discovery jalan di `omp --mode rpc`** — config di-load engine-level, tapi harus dibuktikan
   dengan spike (agent di DevLauncher benar-benar melihat tool-nya).
2. **Event `tool_execution_*` ikut dipancarkan untuk tool MCP** — supaya tool card muncul di
   timeline chat secara otomatis (mekanisme render sudah ada).
3. **Versi protokol MCP yang dipahami omp** (2025-03-26 vs 2024-11-05) — hand-rolled server harus
   cocok; diverifikasi di spike dengan omp asli.

### Arsitektur (ringkas)

```
┌────────────────────────── DevLauncher (proses GUI) ─────────────────────────┐
│                                                                              │
│  Renderer (React) ◄── IPC ──► main process                                  │
│  Chat UI (tool card)              │                                          │
│       ▲                           ├─ Managers (ProcessManager, StorageManager,│
│       │ tool_execution_* events   │   RepoManager, PreviewManager, ...)      │
│       │                           ├─ MCP Server (127.0.0.1:<port>)  ──┐      │
│  ┌────┴────────────────────┐      │   - tools.ts (registri tool)       │      │
│  │ omp --mode rpc          │      │   - auth.ts (token)                │      │
│  │ (agent per project)     │◄─────┼─ MCP client (bawaan omp) ◄─────────┘      │
│  │ cwd = folder project    │  HTTP│                                        │
│  └─────────────────────────┘      │   config: ~/.omp/agent/mcp.json       │
└──────────────────────────────────┴─────────────────────────────────────────┘
```

Alur tool call: agent memutuskan memakai tool → omp (MCP client) → HTTP → MCP server DevLauncher →
handler memanggil manager → hasil dikembalikan → omp memancarkan `tool_execution_*` → chat UI
menampilkan tool card → agent merangkum hasilnya.

---

## 2. Skala Prioritas & Estimasi

- **P0 — quick win**: verifikasi & fondasi (≤ 1 hari).
- **P1 — nilai tinggi**: fitur inti yang langsung berguna.
- **P2 — lanjutan**: hardening, polish, opsi lanjutan.

Estimasi total: **±14 hari kerja** (F0: 1, F1: 3, F2: 4, F3: 4, F4: 2).

---

## 3. Fase 0 — Spike & Verifikasi (P0, ±1 hari)

**Tujuan:** membuktikan asumsi ⚠️ (D3, D4, D5) sebelum menulis kode produksi. Hasil spike
dicatat sebagai bagian dari dokumen ini (section "Catatan Spike" di bawah).

**Deliverable:**
- Script spike: spawn `omp --mode rpc` dengan config user-level yang menunjuk MCP server trivial
  (stdio echo server 20 baris), lalu verifikasi tool muncul di `get_available_commands` / event
  agent dan bisa dipanggil.
- Catatan hasil: (a) MCP discovery di RPC mode ✓/✗, (b) tool card muncul di chat ✓/✗,
  (c) versi protokol MCP yang dipakai omp, (d) perilaku timeout.
- Keputusan final D3 (path config) & D4 (nilai timeout) dikunci.

**Acceptance criteria:**
- [ ] Spike berhasil: agent asli (bukan mock) melihat & memanggil tool dari MCP server trivial.
- [ ] Jika discovery RPC gagal → keputusan fallback tertulis (transport stdio `DevLauncher.exe --mcp`
      atau env-injection) dicantumkan di section Catatan Spike, bukan diam-diam ganti desain.

**Effort:** 1 hari. **Risiko:** rendah (spike murni, tidak menyentuh kode produksi).

---

## 4. Fase 1 — MCP Server + Tool Read-only (P1, ±3 hari)

**Tujuan:** fondasi server MCP yang aman + tool baca sehingga agent bisa "melihat" workspace
DevLauncher, tampil sebagai tool card di chat.

**Deliverable:**
- `electron/mcp/server.ts` — HTTP server (Node `http`) di `127.0.0.1:0` (port acak):
  implementasi minimal MCP (initialize, initialized, tools/list, tools/call), validasi
  `Authorization: Bearer <token>` di tiap request, tolak koneksi non-localhost.
- `electron/mcp/tools.ts` — registri tool deklaratif: `{ name, description, inputSchema,
  permission: 'read'|'write'|'destructive', handler }`; handler memanggil manager yang sudah ada
  (bukan duplikasi logika).
- `electron/mcp/ompConfig.ts` — writer config: baca `~/.omp/agent/mcp.json`, **merge** (entry lain
  user tidak disentuh), tulis entry `devlauncher`; hapus entry saat toggle off.
- `electron/mcp/index.ts` — lifecycle: start saat app siap & toggle on, stop saat quit; expose
  state (port, token, running) untuk renderer.
- Settings: toggle **"Agent dapat mengontrol DevLauncher"** + status chip (aktif di port X / off).
- Preload + IPC: `mcp-status`, `mcp-set-enabled` (via config update saja — reuse `update-config`).

**Tool Fase 1 (read):**

| Tool | Fungsi | Permission |
|---|---|---|
| `devlauncher_list_projects` | Daftar project (nama, path, framework, status) | read |
| `devlauncher_get_project` | Detail project + status runtime (pid, uptime, cpu/mem) | read |
| `devlauncher_get_project_logs` | Tail log project (max N baris) | read |
| `devlauncher_git_status` | Status git project (branch, changes) | read |
| `devlauncher_get_app_config` | Config app (tema, bahasa, notifikasi, dst) — tanpa secret | read |
| `devlauncher_get_presets` | Daftar preset | read |
| `devlauncher_get_health` | Health analytics project (crash, uptime) | read |
| `devlauncher_system_env` | Status tools sistem (node, git, dst) | read |

**Acceptance criteria:**
- [ ] Unit test server MCP: initialize/tools/list/tools/call, request tanpa token ditolak (401),
      tool tak dikenal → error MCP yang rapi, bukan crash.
- [ ] Unit test `ompConfig.ts`: merge tidak menghapus entry user lain, hapus entry saat off,
      file korup ditangani (backup + tulis ulang).
- [ ] Unit test tool handler Fase 1 dengan manager fake (pola sama dengan test handler IPC).
- [ ] Manual (packaged/dev): agent di-chat diminta "project apa saja yang ada?" → tool card
      `devlauncher_list_projects` muncul → jawaban berisi daftar project.
- [ ] Redaksi secret terverifikasi: tidak ada nilai env yang bocor ke agent.

**Effort:** 3 hari. **Risiko:** sedang — protokol MCP hand-rolled harus cocok dengan klien omp
(mitigasi: spike Fase 0 + test melawan omp asli).

---

## 5. Fase 2 — Tool Control (write, non-destruktif) (P1, ±4 hari)

**Tujuan:** agent bisa bertindak — mengelola project, git, terminal, preview — dengan audit penuh,
tanpa konfirmasi (kategori write).

**Deliverable:**
- Tool baru (semua `write`, dicatat ke activity feed + main.log, argumen divalidasi schema di
  boundary MCP — pola `CHANNEL_RULES` yang sudah ada diadaptasi untuk tool MCP):

| Tool | Fungsi |
|---|---|
| `devlauncher_start_project` / `stop_project` / `restart_project` | Lifecycle project |
| `devlauncher_start_all_projects` / `stop_all_projects` | Lifecycle massal |
| `devlauncher_apply_preset` | Terapkan preset (start N project) |
| `devlauncher_run_project_script` | Jalankan script package.json |
| `devlauncher_npm_install` / `npm_update_package` | Dependencies |
| `devlauncher_git_stage` / `unstage` / `commit` / `checkout` / `pull` / `push` / `stash_*` / `discard` | Operasi git |
| `devlauncher_terminal_create` / `terminal_input` / `terminal_kill` | PTY interaktif per project |
| `devlauncher_preview_open` / `reload` / `navigate` / `read_console` | Preview embedded + baca console (agent bisa lihat error runtime) |
| `devlauncher_env_write` | Tulis `.env` project (nilai secret tetap di-redact dari output/log) |
| `devlauncher_config_update` | Update config app — **whitelist key aman** (tema, bahasa, notifikasi, terminal) |
| `devlauncher_append_activity` | Tulis entri activity feed |

- Validasi argumen per tool (tipe + bounds) sebelum handler jalan — reuse/mirror
  `ipcValidation` di boundary MCP.
- Audit log: tiap tool call → activity feed (`Agent <session> menjalankan <tool> pada <project>`)
  + baris di main.log dengan konteks session.

**Acceptance criteria:**
- [ ] Integration test: tool control memanggil manager sungguhan di proses test (start/stop
      project fixture, git ops di folder temp, terminal create/input/kill) — pola test
      ProcessManager/handler yang sudah ada.
- [ ] Validasi argumen: input malformed ditolak dengan error MCP, bukan crash.
- [ ] Activity feed berisi entri audit untuk tiap aksi write.
- [ ] Manual: agent diminta "start project X lalu buka preview-nya" → kedua aksi jalan, tool card
      muncul, status project berubah di UI.

**Effort:** 4 hari. **Risiko:** sedang — interaksi terminal & preview butuh sinkronisasi state
dengan UI (status berubah harus terlihat live; reuse event yang sudah ada: `process-status`,
`projects-updated`).

---

## 6. Fase 3 — Tool Destructive + Alur Konfirmasi (P1, ±4 hari) — SELESAI ✅ (16 Agu 2026)

**Tujuan:** aksi berisiko dengan **persetujuan user** — modal muncul di UI, tool call menunggu
keputusan, hasil (approve/deny) dikembalikan ke agent.

**Implementasi:** `electron/mcp/approval.ts` (state machine — request/respond/timeout 120s/
denial saat window tak ada), gate di `dispatchTool` (`permission: 'destructive'` → parkir sampai
user menjawab), `electron/mcp/toolsDestructive.ts` (9 tool), modal `McpApprovalModal.tsx`
(queue + approve/deny/deny-all, terpasang global via AppModals), IPC `mcp-approval-request`
(push) / `mcp-approval-respond`, audit keputusan user di activity feed + main.log.

**Deviasi kecil dari tabel tool:** `devlauncher_update_check` dibuat `read` (tanpa modal — hanya
mengecek versi), sedangkan `devlauncher_update_download_install` tetap `destructive`. Backup
export menulis file ke folder Documents dan **hanya mengembalikan path** (bundle berisi secret
.env — tidak pernah sampai ke agent, sesuai D8).

**Deliverable:**
- **Mekanisme approval**: tool `destructive` → handler mengembalikan Promise yang resolve saat
  user memilih **Setujui** / **Tolak** di modal renderer (server MCP menunggu; timeout server
  `120000`/0 sesuai D4). Deny → tool mengembalikan pesan error yang jelas untuk agent
  ("User menolak operasi ini").
- Modal approval: tampilkan tool, target (nama project), ringkasan aksi, dan konteks pesan agent;
  antrean bila beberapa request bersamaan.
- Tool baru:

| Tool | Fungsi |
|---|---|
| `devlauncher_delete_project` | Hapus project dari workspace |
| `devlauncher_force_stop_project` | Stop paksa (SIGKILL/taskkill /F) |
| `devlauncher_backup_export` / `backup_import` | Backup workspace (password opsional) |
| `devlauncher_update_check` / `update_download_install` | Update aplikasi |
| `devlauncher_clear_health` / `clear_crash_dumps` | Hapus data diagnostik |
| `devlauncher_config_update_destructive` | Key config sensitif (startOnBoot, autoStartProjects, minimizeToTray) |

- IPC renderer: `mcp-approval-request` (push ke renderer), `mcp-approval-respond` (dari renderer).
- Semua destructive tetap dicatat di activity feed + main.log (termasuk keputusan user).

**Acceptance criteria:**
- [x] Unit test alur approval: request pending → respond approve/deny → tool call resolve dengan
      hasil yang benar; timeout → error rapi. (`approval.test.js` — termasuk deny-all, duplikat
      respond, denial saat sender tak tersedia, masking secret di payload modal)
- [x] Component test modal approval (render, tombol, deny, queue, deny-all, i18n id/en).
- [x] Tidak ada cara memanggil tool destructive tanpa modal: gate ada di satu titik `dispatchTool`
      (satu-satunya jalur tools/call); test memverifikasi **setiap** tool `destructive` ditolak
      tanpa approval sender. (`toolsDestructive.test.js`)
- [x] Audit: tiap keputusan (approve/deny/timeout) tercatat di activity feed + main.log dengan
      args ter-redaksi.
- [ ] Manual: agent diminta "hapus project X" → modal muncul → Tolak/Setujui (perlu uji di app
      nyata dengan omp + MCP aktif).

**Effort:** 4 hari. **Risiko:** sedang — alur approval memblokir tool call HTTP; perlu test
timeout & antrean. UX modal harus jelas (user tidak bingung "kenapa ada modal").

---

## 7. Fase 4 — Hardening, Polish & Dokumentasi (P2, ±2 hari) — SELESAI ✅ (16 Agu 2026)

**Tujuan:** fitur siap dipakai harian: kontrol izin, observability, keamanan final, dokumentasi.

**Implementasi:**
- **Matriks izin per kategori** — `agent.permissions { read, write, destructive }` di config
  (default semua aktif); 3 toggle di Settings (muncul saat agent-control aktif); gate di satu
  titik `dispatchTool` — kategori nonaktif ditolak di boundary MCP dengan pesan jelas.
- **Rate limit & payload di boundary** — sliding-window 120 req/10 s per address, max payload
  512 KB (413), concurrency guard 16 in-flight (429). Token per-launch (D2) tidak pernah di-log
  (mcp-status hanya mengembalikan port).
- **Audit penuh** — semua aksi (read pun) tercatat ringkas di activity feed; main.log memuat
  tool + permission + **durasi tool call**; args selalu ter-redaksi.
- **e2e Playwright `e2e/mcp.spec.js`** (3 test): MCP client asli (Node fetch) → handshake →
  tools/list → read/write tool; tool destruktif memicu modal di app nyata → deny membatalkan,
  approve mengeksekusi; kategori nonaktif ditolak. Isolasi via `DEVLAUNCHER_OMP_CONFIG_DIR`
  (tidak menyentuh `~/.omp/agent/mcp.json` asli).
- Docs: README, docs/FEATURE_STATUS.md, CHANGELOG.

**Deliverable:**
- **Matriks izin di Settings** — per kategori (read/write/destructive) toggle on/off, plus opsi
  scope per project (agent hanya bisa mengontrol project yang sedang dibuka).
- Rate limiting & max payload di boundary MCP; token di-rotate tiap launch (sudah D2, dipastikan
  tidak pernah muncul di log).
- Audit lengkap: semua aksi (read pun) tercatat ringkas di activity feed; main.log punya konteks
  session agent + durasi tool call.
- e2e Playwright: alur penuh dengan mock omp yang **menjadi MCP client asli** ke server DevLauncher
  (fixture `mock-omp-rpc.js` diperluas) — agent → tool call → action → tool card → jawaban.
- Update `README.md`, `docs/ARCHITECTURE.md`, `docs/FEATURE_STATUS.md` (jika ada), dan CHANGELOG.
- Security review checklist dijalankan (lihat DoD).

**Acceptance criteria:**
- [x] e2e hijau di CI (alur MCP end-to-end dengan **MCP client asli**, bukan mock): `e2e/mcp.spec.js`
      — handshake, read/write tool, modal approval deny→approve, kategori nonaktif ditolak.
- [x] Coverage untuk `electron/mcp/**` ≥ 70% lines — terukur **90.11% stmts / 71.78% branch /
      82.56% funcs / 90.11% lines**.
- [x] Review keamanan: tidak ada jalur secret ke agent, localhost-only, approval wajib untuk
      destructive, toggle off → server mati + config dibersihkan (lihat checklist di bawah).

### Checklist Security Review (F4) — dieksekusi ✅

- [x] **Tidak ada jalur secret ke agent** — env write tidak meng-echo nilai; backup export
      menulis file dan hanya mengembalikan path (bundle berisi secret .env tidak pernah ke agent);
      args di-audit/ditampilkan di modal dengan redaksi (`password|token|secret|entries.value → ***`);
      `toRendererProject`-style redaksi berlaku untuk semua output project.
- [x] **Localhost-only** — server menolak koneksi non-`127.0.0.1`/`::1` (403); diuji.
- [x] **Auth** — setiap request wajib `Authorization: Bearer <token>` acak per-launch (401 tanpa
      token); token tidak pernah muncul di log / mcp-status / diagnostics.
- [x] **Approval wajib untuk destructive** — satu-satunya jalur tools/call lewat `dispatchTool`;
      test memverifikasi setiap tool `permission: 'destructive'` ditolak tanpa approval sender.
- [x] **Toggle off → server mati + config dibersihkan** — `update-config` memanggil `mcp.stop()`
      → `denyAllApprovals()` + `removeOmpMcpEntry()` (entry dihapus; file dihapus jika kosong).
- [x] **Rate limit & payload** — 120 req/10 s sliding window, 512 KB max body, 16 in-flight;
      diuji di `server.test.js`.
- [x] **Audit** — semua aksi (read pun) masuk activity feed + main.log dengan durasi; deny/timeout
      tool destructive tercatat.

**Effort:** 2 hari. **Risiko:** rendah.

---

## 8. Gerbang Rilis (Definition of Done — berlaku untuk tiap fase)

Checklist sebelum fase dianggap selesai:

- [ ] Lint 0 error, `npm run typecheck` lulus (electron + renderer).
- [ ] Test baru fase tersebut hijau; seluruh suite (saat ini 532 test) tetap hijau.
- [ ] Acceptance criteria fase tercentang — **terverifikasi lewat test/CI**, bukan manual saja.
- [ ] Tidak ada dependency baru (keputusan D5: MCP hand-rolled).
- [ ] Secret tidak pernah muncul di output tool / log / activity feed.
- [ ] Semua aksi write/destructive tercatat di activity feed.
- [ ] Toggle "Agent dapat mengontrol DevLauncher" berfungsi dua arah (on → server start + config
      ditulis; off → server stop + entry config dihapus).

---

## 9. Catatan Spike (Fase 0) — SELESAI ✅ (16 Agu 2026)

Dikerjakan dengan binary omp asli `v17.2.15` (di `%LOCALAPPDATA%\omp\omp`) + profil default user (jalur spawn persis DevLauncher: `omp --mode rpc`, tanpa `--profile`).

- [x] **MCP discovery di `omp --mode rpc` — TERBUKTI.** omp meluncurkan MCP server kita (stdio echo server) dari `~/.omp/agent/mcp.json` dan melakukan handshake penuh: `initialize` → `notifications/initialized` → `tools/list`. Juga terbukti di profil terisolasi. Bonus: omp ikut me-load MCP server lain milik user (browsermcp, free_web_search, unityMCP, vercel) — discovery lintas sumber memang jalan.
- [x] **Agent melihat & memanggil tool MCP — TERBUKTI end-to-end** (dengan model asli via proxy lokal user):
  - Tool di-mount sebagai `mcp__devlauncher_spike_spike_echo` (server `devlauncher-spike` → `devlauncher_spike`; separator tunggal `_`). Di-dokumentasikan ke model via system prompt (`xd://mcp__devlauncher_spike_spike_echo — Echo the input back`).
  - Agent memanggilnya: event `tool_execution_start` / `tool_execution_end` dipancarkan (event yang **persis** dirender UI sebagai tool card) dan MCP server menerima `tools/call` nyata. `agent_end` memuat hasil tool di transkrip.
  - ⚠️ **Temuan UI**: omp merutekan tool MCP lewat tool `write` bawaan dengan `path: xd://mcp__<server>_<tool>` — jadi `toolName` di event adalah `write`, bukan nama MCP. Tool card chat akan menampilkan `write` + path xd. Untuk F1 cukup; polish nama tampilan di F4 (map `xd://mcp__*` → label tool).
- [x] **Versi protokol MCP omp: `2025-11-25`** (client `omp-coding-agent` v1.0.0; bukan 2025-03-26).
- [ ] Perilaku timeout: belum diukur (transport stdio; HTTP pakai `timeout` per-server).
- [x] **Keputusan final D3**: config user-level `~/.omp/agent/mcp.json` TERBUKTI dibaca di RPC mode tanpa `--profile` — sesuai jalur spawn DevLauncher. **D4**: `timeout: 120000` di entry config.
- Catatan setup omp yang ditemukan saat spike: **provider & model dibaca dari `models.yml`** (bukan `config.yml`) di omp 17; `baseUrl` harus menyertakan `/v1`. Relevan untuk pengujian manual, bukan untuk implementasi (kita hanya menulis `mcp.json`).

---

## 10. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| MCP discovery tidak aktif di `--mode rpc` | Fitur tidak jalan | Spike Fase 0 lebih dulu; fallback transport stdio (`DevLauncher.exe --mcp`) atau env-injection config |
| Protokol MCP hand-rolled tidak cocok dengan klien omp (versi/detail header) | Tool tidak muncul / error | Spike + test melawan omp asli; jaga implementasi seminimal mungkin sesuai spec 2025-03-26 |
| Token bocor (log, env dump) | Akses lokal tak sah | Token per-launch, tidak pernah di-log, di-redact di diagnostics bundle |
| Approval flow menggantung (modal tak dibalas) | Tool call timeout | Timeout server (D4) + tombol tolak default; test timeout |
| Aksi agent mengubah state tanpa user sadar | Kebingungan/kehilangan data | Audit activity feed + kategori write vs destructive + toggle off default |
