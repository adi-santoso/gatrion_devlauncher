# Roadmap DevLauncher — Rencana Peningkatan

Dokumen ini berisi rencana perbaikan DevLauncher berdasarkan analisa kode saat ini (commit `8fb48f6`). Ini bukan daftar fitur marketing — tiap item diturunkan dari kondisi nyata repo, diberi prioritas, perkiraan effort, dan dampak. Status per fitur eksisting tetap di [FEATURE_STATUS.md](FEATURE_STATUS.md); riwayat perubahan di [CHANGELOG.md](../CHANGELOG.md).

## Kondisi Saat Ini (hasil analisa)

| Area | Fakta |
|---|---|
| Ukuran kode | ±20.900 baris (src + electron). File terbesar: `AgentChat.jsx` 1.787 baris, `App.jsx` 1.096, `ProcessManager.js` 1.059, `ipcRenderer.js` 840 |
| Kualitas kode | Lint: **0 error, 0 warning** (sejak P0: `eslint-plugin-react` + config JSX benar, deps/import yang tidak terpakai dibersihkan) |
| Test | 13 test CLI (Node) + 178 test Vitest + 4 e2e Playwright. **Coverage ±36% lines** |
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
| Pecah file besar: `AgentChat.jsx` → komponen + hook, `App.jsx` → orchestration dipindah ke hook/context, `ProcessManager.js` → modul | P1 | L | Perawatan & onboarding jauh lebih mudah |
| Seragamkan bentuk respons IPC (sebagian `{ success }`, sebagian bentuk langsung) | P1 | M | Kontrak konsisten, typing lebih mudah |
| TypeScript bertahap: `// @ts-check` untuk semua file electron dulu, lalu renderer; `npm run typecheck` jadi penuh | P1 | L | Bug null/typo turun drastis |
| Konversi 13 test CLI legacy ke Vitest — satu alat test | P2 | M | Satu cara menulis & menjalankan test |

## 2. Reliability & Robustness

| Item | Prioritas | Effort | Dampak |
|---|---|---|---|
| ~~**Single instance lock**~~ → **selesai**: `app.requestSingleInstanceLock()` + focus/restore window pada `second-instance` | P0 ✅ | S | Hilangkan race process/port/PTY yang susah direproduksi |
| ~~Tangkap error renderer + `unhandledRejection`~~ → **selesai**: `window.onerror`/`unhandledrejection` → channel `renderer-error` → main.log; `uncaughtException`/`unhandledRejection` main juga di-log. Dialog "Laporkan masalah" belum ada | P0 ✅ | S | Masalah user bisa didiagnosis tanpa DevTools |
| ~~Lengkapi auto-restart child process dengan backoff~~ → **selesai**: exponential backoff (`delay × 2^n`) + `maxRetries` + tunggu port bebas sudah ada di `maybeAutoRestart`; kini **terverifikasi via vitest** (test backoff: delay 100/200/400 ms, cap retries, disabled) | P1 ✅ | S | Project crash tidak menghentikan workflow |
| Naikkan coverage ke 50–60% untuk path kritis: ProcessManager, StorageManager, OmpManager, preload/security | P1 | M | Regression test lebih percaya diri |
| E2E di luar smoke: add project → start → log → stop; agent chat (mock omp); persistensi settings | P1 | M | Flow utama teruji otomatis |
| Verifikasi rotasi log main process + viewer log di Settings | P2 | S | Support lebih mudah |

## 3. Performance & UX

| Item | Prioritas | Effort | Dampak |
|---|---|---|---|
| ~~Code splitting renderer~~ → **selesai**: `React.lazy` + `Suspense` per view (Dashboard, Projects, Settings, Agent, Detail, TerminalWorkspace). Chunk 838 kB → main 313 kB + per-view; xterm (284 kB) tidak lagi memblokir startup | P0/P1 ✅ | M | Startup & memory turun |
| Virtualisasi list log & percakapan (project dengan log puluhan ribu baris) | P1 | M | Scroll tetap halus |
| ~~Throttle/batch update resource CPU/mem~~ → **selesai** (sudah ada, kini terverifikasi): backend throttle `tasklist` 5 s/project + skip in-flight, renderer poll 4 s hanya untuk project running, dan hanya notify saat nilai berubah — tidak ada re-render storm | P1 ✅ | S | Dashboard stabil saat banyak project |
| Global shortcut (mis. `Ctrl+Shift+Space`) untuk summon window dari tray | P2 | S | Akses cepat dari mana saja |
| Theme: tambah opsi auto-follow system (dark/light sudah ada) | P2 | S | Default lebih nyaman |

## 4. Security

| Item | Prioritas | Effort | Dampak |
|---|---|---|---|
| Schema validation terpusat per channel IPC — **sebagian ✅**: `electron/utils/ipcValidation.js` memvalidasi payload channel terminal (`input` di-cap 64 kB, `resize` bounds, `kill`) dan process (`stop-project` force boolean, `stop-custom-command` runId, `start-all-projects` id array non-empty) dengan 11 test; handler lain tetap punya validasi per-argumen + `projectSchema` | P1 | M | Defence-in-depth di atas allowlist |
| ~~`npm audit` di CI~~ → **selesai** (audit 0 vuln, undici/tar di-patch; dependabot menyusul) | P1 ✅ | S | CVE cepat terdeteksi |
| ~~Test: pastikan secret env tidak pernah masuk log/diagnostics~~ → **selesai**: regression test vitest memulai project dengan env ber-secret dan memastikan nilai secret tidak muncul di log buffered, callback `onLog`, maupun file log yang dipersist | P1 ✅ | S | Jaga komitmen yang sudah ada |
| Code signing certificate untuk distribusi | P2 | M | SmartScreen tidak menghalangi |

## 5. Product & Fitur (nilai tinggi)

| Item | Prioritas | Effort | Dampak |
|---|---|---|---|
| **Auto-update (electron-updater)** + rilis via GitHub Releases | P1 | M | User selalu dapat fix tanpa install ulang |
| **Workspace search**: satu palette untuk cari project, session agent, file, command | P1 | M | Navigasi jauh lebih cepat |
| Agent: tracking cost/token per project + estimasi, template prompt, pencarian session lintas project | P1 | M | Pengguna agent harian diuntungkan |
| Notifikasi Windows dengan action button (Restart/Open) | P2 | S | UX notifikasi lebih baik |
| i18n UI (en/id) — ikuti README yang sudah bilingual; toggle di Settings | P2 | L | Jangkauan lebih luas |
| Backup bundle workspace: export projects+config+presets+health jadi satu file (bisa dienkripsi) | P2 | M | Recovery total dalam satu langkah |
| macOS/Linux: path handling, node-pty, tray, shortcut Cmd, CI matrix | P2 | L | Buka platform baru |

## 6. CI & Distribusi

| Item | Prioritas | Effort | Dampak |
|---|---|---|---|
| ~~CI: tambah `npm run typecheck` + `npm audit`; gate coverage minimum~~ → **selesai**: CI kini menjalankan lint → audit → typecheck → CLI test → vitest + coverage gate (thresholds statements/lines 28%, funcs 32%, branches 60%) → build → e2e | P0 ✅ | S | Kualitas terjaga otomatis |
| Publish pipeline: `electron-builder publish` ke GitHub Releases + feed auto-update | P1 | M | Rilis berkala jadi rutin |
| Changelog otomatis dari conventional commits | P2 | S | Riwayat lebih lengkap |

## 7. Observability & Support

| Item | Prioritas | Effort | Dampak |
|---|---|---|---|
| Export **diagnostics bundle** sekali klik dari Settings: log, health, config tanpa secret, versi app | P1 | S | Troubleshooting jarak jauh |
| ~~Renderer error → main.log~~ → **selesai** sebagai bagian dari error capture P0 | P1 ✅ | S | Error UI tidak hilang tanpa jejak |
| Crash dump / minidump saat app crash | P2 | M | Root cause crash Windows |

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
2. **Minggu 2–4** — P1 code quality: pecah `AgentChat.jsx`/`App.jsx`, seragamkan IPC, TypeScript electron.
3. **Minggu 5–8** — P1 reliability & performance: **coverage path kritis naik ke 35.7% lines** (test ProcessManager backoff + secret masking, StorageManager, ipcSecurity, ipcValidation) **dan code splitting selesai**; tersisa: e2e non-smoke, virtualisasi log.
4. **Minggu 9–12** — P1 product: auto-update, workspace search, agent cost tracking, diagnostics bundle.
5. **Setelah itu** — P2: i18n, macOS/Linux, backup bundle, crash dump, dependabot.

Setiap item P0–P1 punya acceptance criteria sederhana: **"terverifikasi lewat test/CI"**, bukan "terlihat berjalan".
