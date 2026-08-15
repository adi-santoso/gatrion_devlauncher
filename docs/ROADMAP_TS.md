# Roadmap TypeScript Rewrite — DevLauncher

> Status: **SELESAI 100% — 15 Agu 2026 (v0.1.8)**. Seluruh 7 fase eksekusi tuntas dan Definition of Done tercapai penuh (lihat checklist di bawah). Dokumen ini mencatat arahan teknis **dan hasil** rewrite TypeScript **penuh** — renderer dan main process. Prinsip yang dipakai: **strangler migration** — kode baru ditulis TypeScript sejak hari pertama, kode lama dikonversi bertahap dari bawah ke atas (leaf → container), setiap fase berakhir dengan build + test + e2e hijau.

## Hasil Akhir (15 Agu 2026)

| Fakta | Nilai |
|---|---|
| File renderer (TS/TSX) | **133 file** — 0 `.js`/`.jsx` di kode produksi |
| File main process (TS) | **45 file** — 0 `.js` |
| Strictness | `strict: true` + `noUnusedLocals`/`noUnusedParameters` di kedua tsconfig |
| Explicit `any` | **0** — 2 situs batas IPC di `ipcValidation.ts` diberi `eslint-disable` terdokumentasi |
| Ukuran file | Maks **400 baris** (lint 0 warning; file raksasa lama dipecah saat konversi) |
| Toolchain | Vite 7.3 · electron-vite 5 · TypeScript 5.9 · Vitest · electron-builder 26 |
| Safety net | **512 test Vitest** + **7 e2e Playwright** — hijau di setiap fase |
| Verifikasi penuh | typecheck 0 error · lint 0 error & 0 warning · build OK · 7/7 e2e · **versi 0.1.8** |

## Keputusan Arsitektur

### 1. Renderer → TypeScript murni (`.tsx`) — KEPUTUSAN: YA

Vite/esbuild sudah men-transpile `.tsx`; biaya migrasi di renderer praktis nol. Ini sumber nilai utama: 120 file yang selama ini tanpa tipe, plus shape drift antar komponen (project, config, session) yang sudah mulai terasa.

### 2. Main process → TypeScript murni via bundler — KEPUTUSAN: **JALUR B (final)**

Node/Electron tidak menjalankan `.ts` langsung, jadi main process TS murni menuntut pipeline build yang belum pernah ada. **Keputusan: diambil, penuh, tanpa kompromi** — bukan JSDoc.

| Jalur | Status |
|---|---|
| A. Tetap `.js` + JSDoc `@ts-check` | ❌ Ditolak — "full serius" |
| **B. TS murni via bundler → output CJS** | ✅ **DIPILIH** |

Konsekuensi yang harus diselesaikan di Fase 1:

- Pasang bundler untuk main + preload (**electron-vite** — rekomendasi; alternatif esbuild — lihat lampiran).
- `package.json` `main` → output bundel (bukan `electron/main.js`).
- Script `dev`/`build`/packaging berubah; `electron-builder` menyalin output bundel + `dist-react`.
- Path `preload` (kini di `__dirname/preload.js`) dan cek `will-navigate` (loadFile `../dist-react/`) menyesuaikan lokasi output.
- e2e + CI matrix 3 OS: jalankan dari output bundel (build main dulu sebelum launch).
- 32 file electron dikonversi `.js` → `.ts` (sebagian besar sudah JSDoc penuh — konversi mekanis), `strict: true`.

### 3. Tipe bersama untuk batas IPC — KEPUTUSAN: YA, TS-native dua sisi

Renderer dan main process berkomunikasi lewat IPC; bentuk payloadnya (Project, Config, session, status) melintasi batas. **Satu sumber tipe** — dan karena main process kini juga TS, kedua sisi pakai `import type` langsung (tidak perlu lagi `@typedef`):

```
src/types/shared.d.ts   ← Project, Config, PrayerConfig, Session, ProcessStatus, payload IPC
     ↑ import type        ↑ import type
     │                    │
  renderer (.tsx)      electron (.ts — main process)
```

## Keputusan Final (menggantikan daftar pertanyaan terbuka)

1. **Strictness — `strict: true` penuh sejak Fase 0, tidak bertahap.** Berlaku untuk `tsconfig.app.json` (renderer) dan tsconfig electron (main process). Bukan `strictNullChecks` dulu, bukan "naikkan per folder" — langsung penuh dari file pertama yang dikonversi. Konsekuensi: fase awal lebih lambat, tapi tidak ada pekerjaan ulang di akhir dan tidak ada dua gaya kode.
2. **Main process — Jalur B, full TypeScript** (lihat Keputusan 2). Bundler dipasang di **Fase 1**, sebelum tipe bersama, agar tipe bersama langsung TS-native.
3. **Kebijakan `any` — unknown-first, zero-`any` tanpa pembenaran:**
   - **Utamakan `unknown` + narrowing** (type guard) — bukan `any`.
   - `any` **dipersilahkan hanya** saat tipe benar-benar tidak diketahui: payload IPC dinamis, data JSON eksternal/plugin, nilai dari library tanpa tipe.
   - Setiap `any` **wajib** diberi komentar pembenaran `// TODO(ts): <alasan>` — tidak ada `any` telanjang.
   - Ditegakkan otomatis: `@typescript-eslint/no-explicit-any` (warn sejak Fase 0 → **error di Fase 6**).

## Prinsip Migrasi

1. **Strangler** — file dikonversi satu per satu; tidak ada fase "konversi semua".
2. **Bottom-up** — utils → hooks → komponen leaf → container → view. Komponen yang diimpor banyak dikonversi duluan.
3. **New code TS sejak hari pertama** — aturan wajib dari Fase 0; file baru `.tsx`, bukan `.jsx`.
4. **`unknown` di batas, bukan `any`** — file JS yang belum dikonversi dianggap `any` saat diimpor dari TS (aman, sementara); di sisi keluar, tipe dipersempit dengan guard. Tidak ada `any` yang lolos tanpa `// TODO(ts)`.
5. **Hijau tiap fase** — lint, typecheck (strict), 512+ test, build, 7 e2e; CI gate tetap.
6. **Strict sejak awal** — `strict: true` di kedua tsconfig dari Fase 0; bukan lagi "bertahap".

## Kebijakan Versi & Rilis

- **Baseline: `0.1.0`** — ditandai & dirilis 14 Agu 2026 (semua pekerjaan P0/P1/P2 dikunci sebelum migrasi TS dimulai).
- **Setiap fase selesai → patch version naik 1** (angka paling belakang):

  | Selesai fase | Versi |
  |---|---|
  | Fase 0 — Fondasi strict | `0.1.1` |
  | Fase 1 — Bundler + main process TS | `0.1.2` |
  | Fase 2 — Tipe bersama IPC | `0.1.3` |
  | Fase 3 — Utils & data layer | `0.1.4` |
  | Fase 4 — Common & Layout | `0.1.5` |
  | Fase 5 — Views | `0.1.6` |
  | Fase 6 — Pengetatan & audit `any` | `0.1.7` |
  | Fase 7 — Penuntasan DoD (4 file terakhir, `any`→error, paritas `noUnused`) | `0.1.8` |

  > **Catatan**: DoD penuh tercapai di **Fase 7 (0.1.8)**, bukan 0.2.0 — pemecahan file dan audit `any` berjalan lebih cepat dari estimasi, sehingga penanda "migrasi tuntas" ikut naik patch seperti fase lain.

- **Mekanisme rilis per fase:** `npm version <x.y.z> --no-git-tag-version` (sinkron package.json + package-lock) → update CHANGELOG → commit → `git tag v0.1.x && git push origin v0.1.x` → **`release.yml`** menjalankan quality gate (lint, typecheck, test, coverage, audit) lalu `electron-builder --publish always` → installer Windows (NSIS + portable) + feed auto-update (`latest.yml`) dipublikasikan ke GitHub Releases.
- Perubahan di luar fase (hotfix/feature) juga naik patch (0.1.x) dengan alur yang sama.

## Aturan Arsitektur & Batas Ukuran File

Rewrite TypeScript adalah kesempatan merapikan struktur, bukan sekadar ganti sintaks. Aturan ini **berlaku untuk semua file baru sejak Fase 0**, dan **wajib dipatuhi saat konversi file lama** — konversi = kesempatan memecah, bukan refactor terpisah.

### Lapisan (Clean Architecture ala React)

```
src/types/        → domain types murni (tanpa logika) — shared.d.ts + per-domain
src/utils/        → fungsi murni, tanpa React/side-effect (kecuali dibungkus), testable
src/data/         → satu-satunya tempat panggilan IPC (per-domain: projects.ts, agent.ts, …) + parsing payload
src/hooks/        → orkestrasi state & data (fetch, mutate, subscribe) — tanpa JSX
src/components/
  Common/         → komponen presentasional murni (tanpa logika bisnis)
  <View>/         → komposisi view; tiap komponen fokus satu tanggung jawab
```

**Aliran dependensi hanya ke bawah** (bukan sirkular):

1. **Komponen tidak boleh memanggil IPC langsung** — selalu lewat hooks/data layer.
2. **Hooks tidak merender UI** — hanya mengembalikan state/handler.
3. **Logika bisnis diekstrak ke utils** — murni & testable (pola yang sudah dipakai: `agentChatUtils`, `costEstimate`, `prayerTimes`).
4. **Tipe domain hanya di `src/types`** — komponen/hooks/utils tidak mendefinisikan tipe domain sendiri (impor dari sana).
5. **View adalah komposisi** — satu view = 1 file container tipis + komponen anak fokus; tidak ada file view raksasa.

### Batas ukuran file (hard rule)

- **Maksimal 400 baris per file** (target nyaman 300; hitungan tanpa blank line & komentar).
- Lebih dari itu → **wajib dipecah saat konversi** — bukan dibiarkan, bukan refactor terpisah.
- **Penegakan otomatis**: aturan eslint `max-lines` (warn 400, skip blank/comment) aktif sejak Fase 0; menjadi error di Fase 6.
- File eksisting jadi contoh wajib pecah saat konversi:
  - `AgentChat.jsx` 1.446 baris → dipecah saat konversi menjadi beberapa komponen + helper (< 400 per file).
  - `ipcRenderer.js` 923 baris → dipecah per domain channel (`data/projects.ts`, `data/agent.ts`, `data/terminal.ts`, …) di bawah satu folder `src/data/`.
  - `App.jsx` 949 baris → container tipis; orchestration tetap di hooks.

## Fase Eksekusi

### Fase 0 — Fondasi: strict penuh & aturan main (S · 1–2 hari)

- Tambah `@types/react`, `@types/react-dom`, `typescript-eslint` (dev-only, nol dampak runtime).
- `tsconfig.app.json` untuk renderer: **`strict: true`**, `module: ESNext`, `moduleResolution: bundler`, `jsx: react-jsx`, `allowJs: true`, `checkJs: false`, `lib: [ES2022, DOM]`, `noEmit`. `npm run typecheck` = `tsc -p tsconfig.check.json && tsc -p tsconfig.app.json`.
- Aktifkan eslint: **`max-lines`** (warn 400, skip blank/comment) + **`@typescript-eslint/no-explicit-any`** (warn).
- Struktur folder `src/types`, `src/data` sesuai aturan arsitektur.
- Verifikasi: file `.tsx` percontohan (mis. komponen kecil Common) terbaca tsc **strict** + build + test tetap hijau.
- **Acceptance**: file TSX baru di src lolos `npm run typecheck` (strict) + `npm run build` + vitest; `max-lines` warn 0 pada file baru.

### Fase 1 — Main process: bundler + TS murni (Jalur B) (L · 3–5 hari)

- Pasang bundler (**electron-vite** — rekomendasi; alternatif esbuild, lihat lampiran di bawah).
- `tsconfig.electron.json` **`strict: true`** (ganti `tsconfig.check.json`; `checkJs` tidak lagi diperlukan karena file jadi `.ts`).
- Convert 32 file `electron/**.js` → `.ts` (mayoritas sudah JSDoc penuh — konversi mekanis; JSDoc diubah jadi sintaks tipe).
- Rombak wiring: `package.json` `main` → output bundel; script `dev`/`build`/packaging; path `preload`; cek `will-navigate`; e2e + CI matrix 3 OS launch dari output bundel.
- **Acceptance**: `npm run dev` dan hasil packaging berjalan dari output bundel; 512+ test + 7 e2e hijau di matrix 3 OS; typecheck electron strict 0 error.

### Fase 2 — Tipe bersama batas IPC (M · 2–3 hari)

- Buat `src/types/shared.d.ts`: `Project`, `ProjectCommand`, `Config` (+ sub: prayer, terminal, notifications, autoRestart, preview, agent), `Session` (agent), `ProcessStatus`, `LogEntry`, `Preset`, payload request/response tiap channel inti.
- Sumber kebenaran: `electron/configSchema.ts` (config), `projectHandlers.ts` (project), `agentHandlers.ts` (session), `processHandlers.ts` (status) — kini TS, jadi `import type` dua arah.
- **Acceptance**: error typecheck muncul saat payload renderer tidak cocok dengan kontrak main process; seluruh handler test tetap hijau.

### Fase 3 — Utils & lapisan data (M · 3–5 hari)

Urutan: `ipcRenderer.js` (923 baris — fondasi, semua komponen bergantung padanya) → `costEstimate.js`, `prayerTimes.js` (sudah JSDoc, tinggal rename) → hook data: `useElectronConfig`, `useProjects`, `useProcesses`, `usePrayerTimes`, `useAppHooks`, `useToasts`, `useActivities`, `usePresets`.

- `ipcRenderer.js` (923 baris) **dipecah saat konversi** ke `src/data/` per domain (`projects.ts`, `agent.ts`, `terminal.ts`, `config.ts`, …) sesuai aturan arsitektur — setiap wrapper `invoke` diberi tipe payload + return berdasarkan kontrak Fase 2; `index.ts` tipis sebagai facade. Efek terbesar ke seluruh app.
- **Acceptance**: utils & hooks 100% TS, komponen masih JS tidak patah, tidak ada file data > 400 baris, typecheck strict 0 error.

### Fase 4 — Komponen Common & Layout (M · 3–5 hari)

- `components/Common` (14): `Icon`, `Button`, `ToggleSwitch`, `AnimatedModal`, `VirtualList`, `ConfirmDialog`, dll — murni presentasional, tipe props mudah.
- `components/Layout` (5): `Sidebar`, `TopBar`, `MainLayout`, `PrayerWidget`, `TerminalWorkspace`(stateful).
- **Acceptance**: Common + Layout 100% TS strict; `MainLayout` dan `App.jsx` (masih JS) tidak patah.

### Fase 5 — View (L · 2–3 minggu, urutan berdasarkan ketergantungan)

| View | File | Catatan |
|---|---|---|
| Projects (4) | ProjectsView dll | Ringan, mulai di sini |
| Dashboard (5) | DashboardView 626 baris | Metrics + cards |
| Settings (7) | SettingsView 692 baris | Banyak prop drilling + i18n |
| Modals (9) | ProjectModal, PresetModal, CommandPalette | Form state kompleks |
| ProjectDetail (18) | GitTab 593, EnvironmentTab, LogsTab, AppPreviewTab | Tab per file |
| Terminal (1) | TerminalWorkspace | xterm typing |
| **Agent (12)** | **AgentChat 1.446 baris** (terakhir) | Terbesar + 104 test — convert paling akhir; **wajib dipecah < 400 baris/file** saat konversi |

**Acceptance per view**: file view `.tsx` (strict), e2e view terkait tetap lulus (project lifecycle, settings, agent chat).

### Fase 6 — Pengetatan lanjutan & audit `any` (M · 1 minggu)

- **`@typescript-eslint/no-explicit-any` → error**; audit sisa `any` (target: hanya di batas data eksternal dengan `// TODO(ts)`).
- `noUncheckedIndexedAccess` — evaluasi per folder (mulai `src/types`, `src/utils`; bisa menyakitkan, putuskan per folder).
- `noUnusedLocals`, `noUnusedParameters` aktif.
- **Acceptance**: lint 0/0 (dengan no-explicit-any error), typecheck strict 0 error, tidak ada `any` tanpa komentar pembenaran.

## Metrik Selesai (Definition of Done)

- [x] **0 file `.js`/`.jsx` tersisa di `src/`** (termasuk `main.tsx` entry) **dan di `electron/`** — kode produksi 100% TS.
- [x] `strict: true` aktif di kedua tsconfig sejak Fase 0 — tidak ada folder non-strict.
- [x] `npm run typecheck` 0 error (electron + renderer, dua config).
- [x] 512+ test Vitest + 7 e2e tetap hijau; CI matrix 3 OS hijau dari output bundel.
- [x] Build menghasilkan output yang sama fungsionalnya (struktur bundle tidak memburuk).
- [x] **Tidak ada `any` tanpa pembenaran**; `no-explicit-any` **error** di lint (2 situs batas IPC diberi `eslint-disable` terdokumentasi).
- [x] **Tidak ada file baru/dikonversi > 400 baris**; lapisan dipatuhi (komponen tidak memanggil IPC langsung, tipe domain hanya di `src/types`).

## Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| `AgentChat.jsx` 1.446 baris + pola streaming kompleks | Convert **paling akhir**, dengan 104 test + e2e agent sebagai jaring; **wajib dipecah < 400 baris/file** (rule `max-lines` menegakkan) |
| `strict: true` sejak awal memperlambat fase awal | Diterima sadar — harga "tidak setengah-setengah"; fase 0–1 kecil dan mekanis, sehingga pola strict dipelajari sebelum menyentuh file besar |
| Rombakan bundler (Fase 1) merusak dev/e2e/packaging | Fase 1 punya acceptance eksplisit (dev + packaging jalan dari output bundel, e2e matrix 3 OS); perubahan wiring diisolasi di fase ini saja |
| Pattern JS dinamis (event maps, dynamic import, ref lazy) | `unknown` + guard dulu; `any` berkomentar `// TODO(ts)` hanya bila tipe benar-benar tidak diketahui |
| React 19 typing (memo/forwardRef generics, ref callbacks) | Contoh pola dari file yang sudah convert; `any` berkomentar bila typing React belum mendukung |
| Migrasi setengah-setengah bikin dua gaya kode | Aturan wajib: file baru TS; konversi tidak pernah bolak-balik; strict sejak file pertama |
| Churn git besar per file | Konversi per file terpisah (rename + tipe), bukan gabung dengan perubahan fitur |

## Lampiran: Pilihan bundler main process

| Opsi | Cara kerja | Dev workflow | Churn | Catatan |
|---|---|---|---|---|
| **electron-vite** (rekomendasi) | Satu config `electron.vite.config.ts`; build → `out/main` + `out/preload` + `out/renderer`; `electron-vite dev` = renderer dev server + hot-restart main/preload | Satu perintah, TS-first, HMR penuh | Menengah — ganti `vite.config.js` (renderer plugin react+tailwind tetap jalan), script dev/build, e2e launch | Standar industri untuk Electron+Vite+React; paling "full serius" |
| **esbuild** | Tambah script bundel `electron/main.ts` → `dist/main.cjs`; renderer tetap Vite terpisah | Dua tool (vite + esbuild), main pakai watch terpisah | Rendah — `vite.config.js` & `dist-react` tidak tersentuh | Churn minimal, tapi toolchain terbelah dua |
| tsc compile (tanpa bundler) | `tsc` electron → `dist/` CJS, require eksternal dibiarkan | Butuh watch manual; lebih lambat | Rendah | Hanya jika ingin nol dependensi baru — kurang "serius" |

Keputusan kecil terakhir sebelum Fase 1: pilih **electron-vite** (rekomendasi) atau esbuild.

## Estimasi Total

- **Jalur penuh (Fase 0–6, strict sejak awal, main process Jalur B)**: ±7–10 minggu paruh waktu, jalan paralel dengan pengembangan fitur (strangler).
- Perincian: Fase 0 (1–2 hari) · Fase 1 bundler+main TS (3–5 hari) · Fase 2 tipe bersama (2–3 hari) · Fase 3 utils+data (3–5 hari) · Fase 4 Common+Layout (3–5 hari) · Fase 5 views (2–3 minggu) · Fase 6 pengetatan (1 minggu).

Setiap fase punya acceptance criteria sederhana: **"terverifikasi lewat typecheck (strict) + test + build"**, bukan "terlihat berjalan".
