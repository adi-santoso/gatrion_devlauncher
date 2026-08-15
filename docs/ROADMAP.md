# Roadmap DevLauncher — Rencana Peningkatan

> **STATUS: SELESAI** (keputusan 14 Agu 2026) — seluruh item P0/P1 tuntas; P2 tersisa hanya item yang di-skip dengan sengaja (code signing, berbayar) dan sisanya yang menunggu platform nyata (verifikasi runtime macOS/Linux). **Rewrite TypeScript juga telah tuntas (15 Agu 2026, v0.1.8)** — kode produksi 100% TS strict; lihat [ROADMAP_TS.md](ROADMAP_TS.md).

Dokumen ini berisi rencana perbaikan DevLauncher berdasarkan analisa kode saat ini (commit `8fb48f6`). Ini bukan daftar fitur marketing — tiap item diturunkan dari kondisi nyata repo, diberi prioritas, perkiraan effort, dan dampak. Status per fitur eksisting tetap di [FEATURE_STATUS.md](FEATURE_STATUS.md); riwayat perubahan di [CHANGELOG.md](../CHANGELOG.md).

## Kondisi Saat Ini (hasil analisa)

| Area | Fakta |
|---|---|
| Ukuran kode | ±21.000 baris (src + electron). File terbesar: `AgentChat.jsx` 1.413 baris (dipecah dari 1.787: utils + ToolCard + ChatComposer + ChatHeader diekstrak), `App.jsx` 912 (orchestration pindah ke useToasts/useActivities/usePresets), `ProcessManager.js` 863 (processTree/portCheck/logStore diekstrak), `ipcRenderer.js` 840 |
| Kualitas kode | Lint: **0 error, 0 warning** (sejak P0: `eslint-plugin-react` + config JSX benar, deps/import yang tidak terpakai dibersihkan) |
| Test | **473 test Vitest** (60 file) + **7 e2e Playwright** (smoke + flow agent/process/settings via mock omp & userData isolasi). Satu alat test sejak konversi CLI. **Coverage ±58% lines** |
| Bundle | **Code splitting aktif**: main chunk 313 kB (96 kB gzip) + chunk per view (Dashboard/Projects/Settings/Agent/Detail/Terminal). Tidak ada lagi warning Vite >500 kB |
| Security | Sudah kuat: contextIsolation, CSP, `assertTrustedIpcEvent`, allowlist field, secret env dimask. Belum ada schema validation terpusat per channel |
| Main process | **Single instance lock** + **error capture** (main & renderer → main.log) sudah ada sejak P0. Belum ada **auto-update**, **crash report**, atau **global shortcut** |
| Platform | Windows x64 saja; macOS/Linux belum diuji |
| Runtime deps | Minimal (7 paket). Tidak ada electron-updater, i18n, state manager (zustand sudah dihapus) |

## Skala Prioritas

- **P0 — quick win**: dampak nyata, effort kecil (≤ 1 hari per item).
- **P1 — nilai tinggi**: dampak besar, effort sedang (beberapa hari–minggu).
- **P2 — lanjutan**: bagus untuk punya, effort lebih besar atau menunggu fondasi.

## 1. Code Quality & Maintainability

| Item | Prioritas | Effort | Dampak |
|---|---|---|---|
| ~~Perbaiki config ESLint~~ → **selesai**: lint **0 error, 0 warning** (`eslint-plugin-react` + `jsx-uses-vars`, 21 `exhaustive-deps` dibereskan, 3 unused disable dihapus) | P0 ✅ | S | Aturan lint benar-benar bekerja; CI lebih terbaca |
| ~~Pecah file besar~~ → **selesai**: `AgentChat.jsx` (1.787 → 1.413 baris) — `agentChatUtils.js`, `ToolCard.jsx`, `ChatComposer.jsx`, `ChatHeader.jsx` diekstrak; `App.jsx` (1.096 → 912 baris) — orchestration toast/activity/preset pindah ke `useToasts.js`/`useActivities.js`/`usePresets.js` (+9 test baru); `ProcessManager.js` (1.059 → 863 baris) — helper platform diekstrak ke `processTree.js` (kill tree, resource sampling), `portCheck.js`, `logStore.js` (persist JSONL) | P1 ✅ | L | Perawatan & onboarding jauh lebih mudah |
| ~~Seragamkan bentuk respons IPC~~ → **selesai**: `safeHandle(ipcMain, assertTrusted, channel, handler)` di `ipcValidation.js` — satu wrapper yang menjamin tiap channel mengembalikan `{ success: true, ... }` / `{ success: false, error }` (tidak pernah reject), selalu `assertTrustedIpcEvent` + validasi payload, dipakai oleh **semua 8 file handler** (104 channel); 4 test envelope baru | P1 ✅ | M | Kontrak konsisten, typing lebih mudah |
| ~~TypeScript bertahap~~ → **selesai (fase electron)**: `// @ts-check` di 33 file electron (handler, manager, utils, main, preload), `tsconfig.check.json` kini `checkJs: true` + include `electron/**/*.js` → `npm run typecheck` 0 error. Bonus: ketemu & fix bug nyata `fs.copyFile` callback-style yang dipanggil promise-style di backup Dependencies. Fase renderer (JSX) menyusul | P1 ✅ | L | Bug null/typo turun drastis |
| ~~Konversi 13 test CLI legacy ke Vitest — satu alat test~~ → **selesai**: semua 13 test CLI dihapus, `npm test` kini `vitest run` (satu alat test; CI step di-update). Cakupan unik di-port & diperluas: **ProcessManager lifecycle nyata** (spawn sungguhan: start/stop/exit code/composite/staggered readiness/port conflict/waitForPort — 13 test), **processHandlers trusted-id** (arg attacker diabaikan, port injection per-command, untrusted sender — 5 test), **PreviewManager** (8 test via mock WebContentsView + session partition), **prayerTimes** golden values (5 test), **configSchema** (6 test, sebelumnya 0%), legacy schema migration + envVarsToObject (4 test), **StorageManager recovery dari backup** + serialisasi queue (5 test) | P2 ✅ | M | Satu cara menulis & menjalankan test |

## 2. Reliability & Robustness

| Item | Prioritas | Effort | Dampak |
|---|---|---|---|
| ~~**Single instance lock**~~ → **selesai**: `app.requestSingleInstanceLock()` + focus/restore window pada `second-instance` | P0 ✅ | S | Hilangkan race process/port/PTY yang susah direproduksi |
| ~~Tangkap error renderer + `unhandledRejection`~~ → **selesai**: `window.onerror`/`unhandledrejection` → channel `renderer-error` → main.log; `uncaughtException`/`unhandledRejection` main juga di-log. Dialog "Laporkan masalah" belum ada | P0 ✅ | S | Masalah user bisa didiagnosis tanpa DevTools |
| ~~Lengkapi auto-restart child process dengan backoff~~ → **selesai**: exponential backoff (`delay × 2^n`) + `maxRetries` + tunggu port bebas sudah ada di `maybeAutoRestart`; kini **terverifikasi via vitest** (test backoff: delay 100/200/400 ms, cap retries, disabled) | P1 ✅ | S | Project crash tidak menghentikan workflow |
| ~~Naikkan coverage ke 50–60% untuk path kritis~~ → **selesai ✅**: OmpManager 0 → **83%** (16 test via mock RPC fixture `tests/fixtures/mock-omp-rpc.js`), ProjectDetector 0 → **~90%** (10 test), StorageManager 84%, ProcessManager 49%; handler IPC 6.79% → **86%**, preload 0% → **91%**, HealthManager/OmpConfig 0% → **~98%**; total **±55% lines** (dari 38.4%). Sisa gap: `main.js`, OmpInstaller, PreviewManager/TrayManager | P1 ✅ | M | Regression test lebih percaya diri |
| ~~E2E di luar smoke~~ → **selesai**: add project (modal + browse test-hook) → start → log stream → stop; agent chat end-to-end pakai mock omp (session baru, prompt, reply streaming, token badge + persist); persistensi settings lintas restart — **7 test Playwright** | P1 | M | Flow utama teruji otomatis |
| ~~Verifikasi rotasi log main process + viewer log di Settings~~ → **selesai**: rotasi diekstrak ke `electron/utils/logRotation.js` (murni, unit-testable — 4 test), dipakai `logger.js`; kartu **Main Log** di Settings menampilkan 500 baris terakhir `main.log` lewat channel baru `get-main-log` (refresh manual) | P2 ✅ | S | Support lebih mudah |

## 3. Performance & UX

| Item | Prioritas | Effort | Dampak |
|---|---|---|---|
| ~~Code splitting renderer~~ → **selesai**: `React.lazy` + `Suspense` per view (Dashboard, Projects, Settings, Agent, Detail, TerminalWorkspace). Chunk 838 kB → main 313 kB + per-view; xterm (284 kB) tidak lagi memblokir startup | P0/P1 ✅ | M | Startup & memory turun |
| ~~Virtualisasi list log & percakapan~~ → **selesai**: komponen `VirtualList` (windowing + pengukuran tinggi dinamis via ResizeObserver, cache per item key, spacer layout) dipakai di LogsTab dan daftar pesan AgentChat; render penuh di bawah threshold 500/400 baris jadi perilaku kecil tidak berubah | P1 ✅ | M | Scroll tetap halus |
| ~~Throttle/batch update resource CPU/mem~~ → **selesai** (sudah ada, kini terverifikasi): backend throttle `tasklist` 5 s/project + skip in-flight, renderer poll 4 s hanya untuk project running, dan hanya notify saat nilai berubah — tidak ada re-render storm | P1 ✅ | S | Dashboard stabil saat banyak project |
| ~~Global shortcut (mis. `Ctrl+Shift+Space`) untuk summon window dari tray~~ → **selesai**: `globalShortcut.register('CommandOrControl+Shift+Space')` — toggle show/hide + focus window dari mana saja (Cmd di macOS, Ctrl di Windows/Linux); unregister saat quit | P2 ✅ | S | Akses cepat dari mana saja |
| ~~Theme: tambah opsi auto-follow system (dark/light sudah ada)~~ → **selesai**: opsi **System** di ThemeSelector — mengikuti `prefers-color-scheme` OS secara live (media query listener); `config.theme` kini menerima `'system'` (validasi + normalisasi diperbarui) | P2 ✅ | S | Default lebih nyaman |

## 4. Security

| Item | Prioritas | Effort | Dampak |
|---|---|---|---|
| ~~Schema validation terpusat per channel IPC~~ → **selesai ✅**: `CHANNEL_RULES` di `ipcValidation.js` kini mencakup **semua 104 channel** dari 8 file handler (terminal, desktop, preview, process, project, git/npm, system, omp) — tipe + bounds (string maxLength, integer range, boolean, object, number, stringArray) diperiksa sebelum handler jalan; regression test `channelRegistry.test.js` memastikan channel baru tanpa rule langsung gagal | P1 ✅ | M | Defence-in-depth di atas allowlist |
| ~~`npm audit` di CI~~ → **selesai** (audit 0 vuln, undici/tar di-patch; dependabot menyusul) | P1 ✅ | S | CVE cepat terdeteksi |
| ~~Test: pastikan secret env tidak pernah masuk log/diagnostics~~ → **selesai**: regression test vitest memulai project dengan env ber-secret dan memastikan nilai secret tidak muncul di log buffered, callback `onLog`, maupun file log yang dipersist | P1 ✅ | S | Jaga komitmen yang sudah ada |
| Code signing certificate untuk distribusi | P2 | M | SmartScreen tidak menghalangi |

## 5. Product & Fitur (nilai tinggi)

| Item | Prioritas | Effort | Dampak |
|---|---|---|---|
| ~~**Auto-update (electron-updater)** + rilis via GitHub Releases~~ → **selesai**: `electron-updater` di-wire di main process (`createUpdater` — state machine unit-tested dengan DI), auto-check saat start, banner Settings kini bisa **Download & install** (progress %) → **Restart & install**; perbandingan versi di `check-update` diperbaiki ke semver numerik (`isVersionNewer`, 8 test); `electron-builder.json` punya publish config github + workflow `release.yml` (tag `v*` → lint/typecheck/test/audit → `electron-builder --publish always`) | P1 ✅ | M | User selalu dapat fix tanpa install ulang |
| ~~**Workspace search**~~ → **selesai** (batch 6): Command Palette kini mencari project, **session agent lintas semua project** (dari registry `agent-sessions.json` via `omp-list-all-sessions`), **file** (scanner `electron/utils/workspaceSearch.js`, max 6 level, ignore node_modules/dist/lockfile, debounce 250 ms, highlight match), dan command; pilih session → langsung buka chat-nya di Agent, pilih file → buka di editor default OS | P1 ✅ | M | Navigasi jauh lebih cepat |
| ~~Agent: tracking cost/token + template prompt~~ → **selesai**: estimasi cost per turn (`src/utils/costEstimate.js`, tabel harga per model + fallback blended) ditampilkan di footer composer & badge session sidebar (persist `cost` di registry lewat `omp-update-session-tokens`), total per project di header sidebar; **template prompt** (save/insert/delete, localStorage) di composer. Pencarian session lintas project sudah ada sejak batch 6 | P1 ✅ | M | Pengguna agent harian diuntungkan |
| ~~Notifikasi Windows dengan action button (Restart/Open)~~ → **selesai**: `actions` + event `action` di Electron 43 (toast Windows); notifikasi crash project punya tombol **Restart** (restart via ProcessManager tanpa buka app) + klik badan toast fokus app & buka project; notifikasi update-ready punya tombol **Restart & install** (quitAndInstall) | P2 ✅ | S | UX notifikasi lebih baik |
| ~~i18n UI (en/id) — ikuti README yang sudah bilingual; toggle di Settings~~ → **selesai (fondasi + permukaan utama)**: `src/i18n/` — `translations.js` (dictionary en/id, parity key dijaga test), `I18nContext.jsx` (`I18nProvider` + `useI18n().t(key, vars)`, fallback en → raw key). `config.language` baru ('en' default, divalidasi di configSchema + normalisasi + mock). **Toggle Bahasa di Settings** (tombol English/Bahasa Indonesia) + seluruh kartu Settings diterjemahkan (update banner, general, notifications, auto-restart, preview, data, backup, main log, crash reports, prayer, theme) + label navigasi Sidebar. e2e membuktikan toggle → sidebar berubah → persist `language:'id'` lintas restart. Migrasi view lain (Dashboard/Projects/Agent/detail) bisa menyusul bertahap memakai hook yang sama | P2 | L | Jangkauan lebih luas |
| ~~Backup bundle workspace: export projects+config+presets+health jadi satu file (bisa dienkripsi)~~ → **selesai**: modul pure `electron/utils/workspaceBackup.js` (build/encrypt AES-256-GCM via scrypt/decrypt/parse/validate/merge) + handler `backup-export` / `backup-import` (safeHandle + rule terpusat); kartu **Workspace Backup** di Settings dengan password opsional; import **merge tanpa overwrite** (project baru ditambah, duplikat di-skip, config saat ini menang, preset baru ditambah by id); +16 test | P2 ✅ | M | Recovery total dalam satu langkah |
| ~~macOS/Linux: path handling, node-pty, tray, shortcut Cmd, CI matrix~~ → **sebagian selesai (audit + fix + CI)**: audit seluruh kode platform-specific — shortcut sudah `CommandOrControl` (Cmd di macOS), `omp-run-setup` sudah branching non-win32, tray pakai `nativeImage` fallback, desktop handlers pakai API lintas-platform (`showItemInFolder`/`openPath`), `killProcessTree`/resource sampling sudah platform-aware. **Bug nyata diperbaiki**: `normalizePathKey` kini case-insensitive **hanya di Windows** (`electron/utils/pathKey.js`, +4 test) — di Linux/macOS path case-sensitive tidak lagi dianggap duplikat. **CI matrix**: `windows-latest` + `macos-latest` + `ubuntu-latest` (e2e Linux via `xvfb-run`), fail-fast off. Sisanya (verifikasi runtime macOS/Linux, build/publish macOS+Linux di release.yml) butuh runner/platform nyata | P2 | L | Buka platform baru |

## 6. CI & Distribusi

| Item | Prioritas | Effort | Dampak |
|---|---|---|---|
| ~~CI: tambah `npm run typecheck` + `npm audit`; gate coverage minimum~~ → **selesai**: CI kini menjalankan lint → audit → typecheck → vitest (regression) → vitest + coverage gate (thresholds statements/lines 28%, funcs 32%, branches 60%) → build → e2e | P0 ✅ | S | Kualitas terjaga otomatis |
| ~~Publish pipeline: `electron-builder publish` ke GitHub Releases + feed auto-update~~ → **selesai**: `.github/workflows/release.yml` — push tag `v*` menjalankan quality gate penuh lalu `npx electron-builder --win --x64 --publish always` (NSIS + portable + `latest.yml` feed) ke GitHub Releases | P1 ✅ | M | Rilis berkala jadi rutin |
| ~~Changelog otomatis dari conventional commits~~ → **selesai**: `scripts/changelog.js` (CLI) + `scripts/changelogLib.js` (pure: parse/group/render/insert, 8 test). `npm run changelog` = dry-run ke stdout, `npm run changelog:apply` = insert ke CHANGELOG.md sebelum `## [Unreleased]`. Auto-detect tag terbaru (`--from`), fallback 100 commit terakhir (`--since`), `--version` untuk heading rilis, breaking `!`/scope ditandai. 481 test total | P2 ✅ | S | Riwayat lebih lengkap |

## 7. Observability & Support

| Item | Prioritas | Effort | Dampak |
|---|---|---|---|
| ~~Export **diagnostics bundle** sekali klik dari Settings~~ → **selesai**: tombol "Export diagnostics…" di Settings → Data; bundle JSON berisi versi app/OS, config, health, activities, presets, **proyek dengan env secret di-redact** (`toRendererProject`), dan ekor `main.log` (500 baris) — disimpan via save dialog; `buildDiagnosticsBundle` diuji (redaksi secret terverifikasi) | P1 ✅ | S | Troubleshooting jarak jauh |
| ~~Renderer error → main.log~~ → **selesai** sebagai bagian dari error capture P0 | P1 ✅ | S | Error UI tidak hilang tanpa jejak |
| ~~Crash dump / minidump saat app crash~~ → **selesai**: `crashReporter.start` (uploadToServer:false) menulis minidump ke `userData/crashDumps`; kartu **Crash Reports** di Settings: daftar dump, buka folder, hapus semua; channel `get-crash-dumps` / `clear-crash-dumps` / `open-crash-dumps-folder` | P2 ✅ | M | Root cause crash Windows |

## Gerbang Rilis (Definition of Done)

Checklist yang harus terpenuhi sebelum versi pertama benar-benar dirilis:

- [ ] Tidak ada fitur visible yang diam-diam mock.
- [ ] Lifecycle process tidak meninggalkan orphan; PID/status/log selalu konsisten.
- [ ] Lint 0 error (target: 0 warning), `npm run typecheck` lulus, coverage path kritis ≥ 50%.
- [ ] CI hijau di clean checkout (lint, `npm test`, vitest, build, e2e).
- [ ] NSIS dan portable diuji di Windows bersih, path dengan spasi, user non-admin.
- [ ] Uninstall tidak menghapus user data tanpa consent.
- [ ] Auto-update teruji dari versi lama ke versi baru.

## Urutan Eksekusi yang Disarankan

1. **Minggu 1 (selesai ✅)** — semua P0: lint 0 warning, single instance lock, error capture, CI typecheck + audit + gate coverage.
2. **Minggu 2–4 (selesai ✅)** — P1 code quality: pecah `AgentChat.jsx` (utils + ToolCard + ChatComposer + ChatHeader), `App.jsx` (orchestration → hook), `ProcessManager.js` (helper → modul), seragamkan respons IPC (`safeHandle` di 8 file handler). Tersisa: TypeScript electron.
3. **Minggu 5–8** — P1 reliability & performance: **coverage path kritis naik ke 35.7% lines** (test ProcessManager backoff + secret masking, StorageManager, ipcSecurity, ipcValidation) **dan code splitting selesai**; tersisa: e2e non-smoke, virtualisasi log.
4. **Minggu 9–12** — P1 product: **auto-update + publish pipeline selesai**; tersisa workspace search, agent cost tracking.
5. **Setelah itu** — P2: i18n, macOS/Linux, backup bundle, crash dump, dependabot.

Setiap item P0–P1 punya acceptance criteria sederhana: **"terverifikasi lewat test/CI"**, bukan "terlihat berjalan".
