# Audit: VPS Command Center (F0–F4)

> **Pembaruan audit independen:** lihat [VPS_AUDIT_REMEDIATION.md](VPS_AUDIT_REMEDIATION.md).
> Catatan spike, token TTL 20 detik, dan keterbatasan handoff di bawah adalah snapshot sebelum
> perbaikan; status terbaru beserta bukti pengganti ada di dokumen remediasi.


> Laporan serah-terima untuk audit independen. Ditulis 30 September 2026.
> Spec: [ROADMAP_VPS.md](ROADMAP_VPS.md). Mockup acuan: `mockups/vps-command-center-v1.png`.
> **Status: F0–F3 selesai; F4 sebagian (smoke paket Windows lulus).** Belum ada commit/push —
> perubahan ada di working tree.

## 1. Ringkasan implementasi

Menu **VPS** baru di sidebar (antara Agent dan Settings) berisi daftar server, detail server
(Overview / Services / Logs / Terminal), job remote, dan chat agent berdampingan. Agent omp
tetap berjalan **lokal**; akses server melalui **satu koneksi SSH persisten per server** yang
dimiliki main process. Tool VPS diekspos ke agent lewat **endpoint MCP ter-scope per sesi**,
sehingga target server adalah properti endpoint, bukan argumen yang bisa dimanipulasi agent.

### File utama

**Shared**

| File | Isi |
|---|---|
| [src/types/vps.d.ts](../src/types/vps.d.ts) | `VpsServer`, `VpsServerStatus`, `VpsPolicy`, `VpsJob`, `VpsMetrics`, `VpsOverview`, `VpsService`, `AgentTarget` |

**Main process**

| File | Isi |
|---|---|
| [electron/managers/vps/VpsManager.ts](../electron/managers/vps/VpsManager.ts) | Livecycle koneksi, policy agent, structured reads, terminal, scope |
| [electron/managers/vps/VpsTransport.ts](../electron/managers/vps/VpsTransport.ts) | Wrapper ssh2 (exec streaming, PTY, `hostVerifier`) |
| [electron/managers/vps/vpsStore.ts](../electron/managers/vps/vpsStore.ts) | `vps-servers.json` + `vps-hostkeys.json` (tulis atomik) |
| [electron/managers/vps/vpsCredentials.ts](../electron/managers/vps/vpsCredentials.ts) | `vps-credentials.json` terenkripsi `safeStorage` |
| [electron/managers/vps/vpsJobRegistry.ts](../electron/managers/vps/vpsJobRegistry.ts) | Job remote, output terbatas + redaksi, state jujur, cancel |
| [electron/managers/vps/remoteCommand.ts](../electron/managers/vps/remoteCommand.ts) | Builder/parser murni (quoting POSIX, /proc, systemd, journalctl) |
| [electron/managers/vps/vpsRedact.ts](../electron/managers/vps/vpsRedact.ts) | Redaksi output + bounded buffer |
| [electron/managers/vps/vpsScopes.ts](../electron/managers/vps/vpsScopes.ts) | Registry scope + writer `.omp/mcp.json` |
| [electron/handlers/vpsHandlers.ts](../electron/handlers/vpsHandlers.ts) | 26 channel IPC + 4 push event |
| [electron/mcp/vpsTools.ts](../electron/mcp/vpsTools.ts) | 7 tool VPS (read/exec/restart/job) |

**Renderer**

| File | Isi |
|---|---|
| [src/data/vps.ts](../src/data/vps.ts) | Lapisan data VPS |
| [src/components/Vps/VpsView.tsx](../src/components/Vps/VpsView.tsx) | Orkestrasi 3 panel + review host key |
| [src/components/Vps/VpsServerList.tsx](../src/components/Vps/VpsServerList.tsx) | Daftar server + status + connect |
| [src/components/Vps/VpsServerModal.tsx](../src/components/Vps/VpsServerModal.tsx) | Tambah/ubah server, auth, test connection |
| [src/components/Vps/VpsDetailPanel.tsx](../src/components/Vps/VpsDetailPanel.tsx) | Overview/Services/Logs/Terminal + job |
| [src/components/Vps/VpsTerminal.tsx](../src/components/Vps/VpsTerminal.tsx) | PTY remote (xterm) |
| [src/components/Vps/VpsChat.tsx](../src/components/Vps/VpsChat.tsx) | Chat agent per VPS (reuse `AgentChat`) |

**Perubahan pada kode existing**

| File | Perubahan |
|---|---|
| `electron/mcp/server.ts` | Dukungan endpoint ter-scope (`/mcp/<scopeId>`) dengan token + tool + deps per scope |
| `electron/mcp/toolsShared.ts` | `McpDeps.vpsManager`/`vpsScope`, hook `guard` sebelum approval |
| `electron/mcp/approval.ts` | Payload approval memuat server/environment/cwd; `tool.summary` dipakai |
| `electron/mcp/index.ts` | Resolver scope → tool VPS |
| `electron/main.ts` | Membuat `VpsManager`, `setupVpsHandlers`, shutdown saat quit |
| `electron/preload.ts`, `src/utils/ipcRenderer.ts` | 26 method + 4 subscription |
| `electron/utils/ipcValidation.ts` | 26 `CHANNEL_RULES` baru |
| `src/App.tsx`, `src/AppTypes.ts`, `src/components/Layout/*` | View `vps`, nav item, judul |
| `src/components/Modals/McpApprovalModal.tsx` | Baris target server + environment + cwd |
| `src/i18n/translations.ts` | ~76 key `vps.*` / `nav.vps` (EN + ID) |
| `package.json` | `ssh2` ^1.17.0 (+ `@types/ssh2` dev) |
| `eslint.config.cjs` | Global Node untuk harness `scripts/**/*.mjs`/`.cjs` |

### Bukti F0

```text
node scripts/vps-spike.mjs                     8/8 PASS
npx electron scripts/vps-spike-electron.cjs    PASS (electron=43.1.1 node=24.18.0 modules=148 ssh2=1.17.0)
```

Harness memakai **ssh2 server in-process** (host key ed25519 per run, publickey-only) — tanpa
host/kredensial nyata. Detail keputusan: [ROADMAP_VPS.md §11](ROADMAP_VPS.md).

## 2. Keputusan arsitektur

| ID | Keputusan | Alasan / bukti |
|---|---|---|
| A1 | `ssh2` ^1.17.0 sebagai transport | Pure JS, **0 modul native** (optional deps tidak terpasang) → aman dengan `npmRebuild:false`; terverifikasi di Electron 43 main process |
| A2 | Satu `Client` persisten per server; channel `exec` per operasi; channel `shell` untuk PTY | Sesuai D2; tidak mempertahankan `cd`/env antar-command → `cwd` selalu eksplisit + di-quote |
| A3 | Verifikasi host key sebagai gate handshake (`hostVerifier` + `SHA256:`) | Fingerprint tak dikenal → status `verifying-host` + prompt UI; key berubah tidak pernah `silent accept` |
| A4 | Secret di store terenkripsi terpisah; renderer hanya tahu keberadaannya | Konsisten dengan `CredentialManager` preview, tapi store sendiri (roadmap §5) |
| A5 | **Scope MCP per sesi**: endpoint `/mcp/<scopeId>` + token unik + `.omp/mcp.json` project-scoped di context dir sesi | omp membaca config user-level **dan** project-level; tool VPS tidak menerima `serverId`, jadi argumen tidak bisa memindahkan eksekusi |
| A6 | Target sesi VPS = namespace `vps:<serverId>` dengan `cwd` = context dir | Tidak mengubah `OmpManager`/registry sesi; sesi project tidak perlu migrasi |
| A7 | Policy agent (`agent-disabled`/`read-only`/`controlled`) diperiksa di backend **sebelum** approval | Read-only tidak pernah memunculkan modal approval yang pasti ditolak |
| A8 | State job: `queued/running/succeeded/failed/cancelled/unknown`; cancel = `requested`, bukan `confirmed` | F0 membuktikan channel close ≠ proses remote mati |
| A9 | Output job dibatasi (128 KB) + di-redaksi; job mutating tidak pernah di-retry otomatis | Batas memori/audit; readiness eksplisit |

### Penyimpangan dari roadmap

Lihat [ROADMAP_VPS.md §12.2](ROADMAP_VPS.md). Ringkas: (1) target VPS sebagai “project”
ber-namespace alih-alih mengubah `OmpManager`; (2) tool approval memakai kategori
`destructive` existing + hook `guard` baru; (3) `requestApproval` kini benar-benar memakai
`tool.summary` (sebelumnya dead code); (4) `.omp/mcp.json` scope dihapus 20 detik setelah
dibuat; (5) job dibatasi per sesi; (6) dependensi baru `ssh2`.

## 3. Hasil pengujian dan bukti

| Perintah | Hasil |
|---|---|
| `npm run lint` | **0 error**, 9 warning (semua `max-lines` / `no-unused-vars`; `VpsManager.ts` 443 baris) |
| `npm run typecheck` | **0 error** (electron + renderer) |
| `npx vitest run` | **108 file / 1032 test lulus** |
| `npx playwright test` | **37/37 lulus** (termasuk `e2e/vps.spec.js`) |
| `npx electron-vite build` | OK |
| `node scripts/vps-spike.mjs` | 8/8 PASS |
| `npx electron scripts/vps-spike-electron.cjs` | PASS |
| `npm run build` (NSIS + portable x64) | OK — electron-builder 26.15.3 |
| `node scripts/vps-packaged-smoke.cjs` | **15/15 PASS** pada `dist/win-unpacked/DevLauncher.exe` |

### Bukti smoke paket Windows

`npm run build` menghasilkan `dist/DevLauncher Setup 0.2.9.exe` (NSIS) dan
`dist/DevLauncher 0.2.9.exe` (portable). Seluruh `node_modules/ssh2` ikut terpaket — `npx asar list`
menghasilkan 34 entri `ssh2`, dan `app.asar.unpacked` memuat `node_modules/ssh2/util/pagent.exe` —
sehingga kekhawatiran “dependency ter-externalize tidak ikut terpaket” tertutup.

`scripts/vps-packaged-smoke.cjs` menjalankan **build terpaket** (`app.isPackaged === true`) dengan
`DEVLAUNCHER_USER_DATA` + `DEVLAUNCHER_VPS_CONTEXT_DIR` terisolasi, lalu memakai fixture SSH
in-process (`tests/fixtures/ssh-server.js`) — tanpa host/kredensial nyata:

| # | Check | Bukti |
|---|---|---|
| 1 | build terpaket benar-benar berjalan | `isPackaged=true` |
| 2 | renderer dimuat dari paket | `file://…/resources/app.asar/dist-react/index.html` |
| 3 | nav + view VPS tergambar | nav VPS ditemukan di bundle production |
| 4 | **`ssh2` ter-resolve dari `app.asar`** | test connection berhasil; `ssh-ed25519 SHA256:…` |
| 5 | host key tak dikenal ditolak | `success:false` — “Unknown host key SHA256:… review and trust it first” |
| 6 | connect setelah trust | `state=connected` |
| 7 | overview dari remote | `fixture-host` / `Fixture Linux 1.0` |
| 8 | services dari remote | `nginx.service` (active/running) |
| 9 | journald logs dari remote | `listening on :8080` |
| 10 | exec remote + exit code | `state=succeeded exitCode=0`, output `ran:cd '/var/www/app' && echo packaged-smoke` |
| 11 | PTY remote | shell terbuka, lalu ditutup |
| 12 | disconnect | `state=disconnected` |
| 13 | registry tidak membocorkan private key | 395 byte JSON tanpa `PRIVATE KEY` |
| 14 | persistensi di userData terisolasi | `vps-servers.json` memuat server |

Verifikasi pendukung: `npx asar list` menghitung berkas `node_modules/ssh2` di dalam `app.asar`, dan
`ELECTRON_RUN_AS_NODE=1 dist/win-unpacked/DevLauncher.exe` me-require `ssh2` langsung dari asar
(`ssh2 1.17.0`, Electron 43.1.1, Node 24.18.0, modules 148 — sama dengan lingkungan F0 spike).

### Test baru (47)

| File | Test | Cakupan |
|---|---|---|
| `electron/managers/__tests__/vpsRemoteCommand.test.js` | 13 | Quoting/validasi, parser /proc/systemd/journalctl, CPU delta, redaksi, bounded buffer |
| `electron/managers/__tests__/vpsManager.test.js` | 19 | Registry + credential, restart persistence, unreachable host, trust host key, rejects bad fingerprint, overview/services/logs, unavailable≠0, job sukses/gagal/cancel/timeout/unknown, policy, scope, PTY |
| `electron/handlers/__tests__/vpsHandlers.test.js` | 8 | Payload validation, secret hygiene, delete cleanup, push forwarding |
| `electron/mcp/__tests__/vpsMcpScope.test.js` | 7 | **Isolasi lintas server**, skema tanpa `serverId`, token tidak tertukar, endpoint project tanpa tool VPS, policy read-only/agent-disabled, payload approval |
| `e2e/vps.spec.js` | 2 | Tambah → test → trust host key → connect → overview/services/logs → disconnect; batal trust = tetap disconnected |

### Pemetaan acceptance criteria roadmap

| Fase | Kriteria | Status | Bukti |
|---|---|---|---|
| F0 | Dua sesi dua server tidak bisa saling eksekusi via argumen | ✅ | `vpsMcpScope` — argumen `serverId` diabaikan; job hanya di server target |
| F0 | Exit code, timeout, disconnect, unknown terwakili | ✅ | spike + `vpsManager` (succeeded/failed/cancelled/unknown) |
| F0 | Catatan keputusan tersedia | ✅ | `ROADMAP_VPS.md §11` |
| F0 | Agent asli memanggil tool via SSH → tool card | ❌ | butuh omp + provider nyata |
| F0 | Sesi VPS tidak memakai tool lokal untuk operasi server | ⚠️ | tool VPS terpisah & ter-scope; tool project user-level masih terlihat oleh omp (lihat §4) |
| F1 | Server bertahan restart; secret tidak bocor | ✅ | unit restart-persistence; registry bebas secret |
| F1 | Key salah / unreachable / fingerprint berubah / timeout error jelas | ✅ | spike + unit (`error` + pesan) |
| F1 | Terminal remote: input, resize, interrupt, copy/paste | ⚠️ | input/streaming ✅; resize/interrupt/paste belum diuji |
| F1 | Pindah server tidak salah rute I/O | ✅ | PTY per server; event di-gate `terminalId` |
| F1 | Hapus server bersihkan auth + job aktif | ✅ | unit |
| F2 | Diagnosis prompt “kenapa API tidak bisa diakses” | ❌ | butuh omp nyata |
| F2 | Read-only menolak exec & perubahan di backend | ✅ | guard sebelum approval |
| F2 | Metrics membedakan live/stale/unavailable; polling stop saat disconnect | ✅ | unit + efek polling |
| F2 | Riwayat project tetap terbuka | ✅ | e2e agent 37/37; namespace target |
| F2 | Mode chat penuh, window sempit, light/dark, EN/ID | ⚠️ | fokus chat + EN/ID ✅; light/dark & window minimum belum diverifikasi |
| F3 | Approve menjalankan payload; deny/timeout tidak | ✅ | guard + infrastruktur approval existing + unit scope |
| F3 | Policy dicek ulang; target tak bisa diganti saat approval | ✅ | guard + `capability` + target dari endpoint |
| F3 | Disconnect tidak retry; ambiguitas → unknown | ✅ | unit |
| F3 | Stop chat ≠ cancel job | ✅ | `ompAbort` vs tombol cancel job |
| F3 | Agent cek kondisi setelah perubahan | ❌ | perilaku model; belum diverifikasi |
| F4 | Alur E2E penuh sampai verifikasi | ⚠️ | E2E lulus sampai disconnect; diagnosis/approval/verifikasi belum |
| F4 | Akses lintas server, cancel, redaksi, recovery teruji | ✅ | unit |
| F4 | Lint, typecheck, unit/integrasi, E2E, smoke Windows | ✅ | semuanya lulus; smoke paket Windows 15/15 (`scripts/vps-packaged-smoke.cjs`) |
| F4 | Uji manual VPS Linux + agent asli | ❌ | butuh VPS uji terisolasi |

## 4. Keterbatasan dan risiko

1. **Kebocoran kapabilitas token scope (risiko tertinggi).** `.omp/mcp.json` scope ada di disk
   ~20 detik saat sesi mulai. Agent lokal yang membaca file itu bisa memakai token untuk
   beroperasi pada server tersebut. Ini **bukan** pelanggaran isolasi lintas-server lewat
   manipulasi argumen (tidak mungkin — target dari endpoint), tapi melanggar asumsi “agent
   tidak boleh memperoleh kapabilitas server lain”. Mitigasi sekarang: TTL file + token per
   scope. **Rekomendasi**: pindah ke MCP stdio (helper per sesi) atau kunci endpoint dengan
   identitas proses RPC sebelum mengaktifkan eksekusi remote di rilis.
2. **Config omp user-level masih terlihat oleh sesi VPS.** omp menggabungkan user-level dan
   project-level; tool project DevLauncher tetap tampak di sesi VPS. Roadmap §5 menginginkan
   pemisahan penuh — perlu keputusan lanjutan.
3. **Verifikasi agent nyata belum ada.** Semua jalur MCP diuji dengan klien HTTP asli dan mock,
   bukan omp + model nyata.
4. ~~**Smoke paket Windows belum.**~~ **Sudah dilakukan dan lulus.** `npm run build` +
   `scripts/vps-packaged-smoke.cjs` membuktikan `ssh2` 1.17.0 ter-resolve dari `app.asar` dan
   seluruh alur VPS (connect, read, exec, PTY) berjalan pada build terpaket — lihat §3.
5. **Terminal VPS belum se-setara terminal project** (paste/interrupt/resize).
6. **Batas operasional** yang saat ini dipatok: output job 128 KB, timeout 1–300 s (default 60 s),
   50 job per server, retensi 1 jam, polling overview 10 s, `MAX_SERVICES` 300, batch scope
   config TTL 20 s. Belum ada pengaturan yang dapat dikonfigurasi pengguna.
7. **`VpsManager.ts` 443 baris** melewati konvensi 400 baris (warning `max-lines`, bukan error).

## 5. Pekerjaan tersisa

1. Hardening scope MCP (stdio atau identitas proses) — **prasyarat rilis**.
2. Uji manual VPS Linux + systemd terisolasi dengan omp nyata; simpan bukti (transkrip tool card).
3. Terminal VPS: clipboard paste, Ctrl+C interrupt, verifikasi resize.
4. Pecah `VpsManager.ts` agar kembali <400 baris.
5. Verifikasi visual light/dark + window minimum untuk VPS view; tambah e2e sempit.
6. (F5/F6) SFTP/Files, edit config dengan diff, Docker, deploy plan — **tidak dikerjakan**, sesuai instruksi.

## 6. Cara menjalankan ulang verifikasi

```bash
npm run lint
npm run typecheck
npx vitest run
node scripts/vps-spike.mjs
npx electron scripts/vps-spike-electron.cjs
npx electron-vite build && npx playwright test
npm run build && node scripts/vps-packaged-smoke.cjs   # memerlukan Windows
```

E2E VPS memakai fixture SSH in-process (`tests/fixtures/ssh-server.js`) dengan `userData`
terisolasi dan `DEVLAUNCHER_VPS_CONTEXT_DIR` — tidak menyentuh `~/.omp`, `~/.ssh`, atau VPS nyata.
