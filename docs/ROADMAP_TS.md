# Roadmap TypeScript Rewrite — DevLauncher

> Status: **belum dimulai** — dokumen perencanaan. Roadmap lama (P0/P1/P2) dinyatakan **selesai** per keputusan 14 Agu 2026; dokumen ini adalah arahan teknis untuk menulis ulang renderer ke TypeScript.
>
> Prinsip utama: **strangler migration** — tidak ada big-bang rewrite. Kode baru ditulis TypeScript sejak hari pertama, kode lama dikonversi bertahap dari bawah ke atas (leaf → container), dan setiap fase berakhir dengan build + test + e2e hijau.

## Kondisi Saat Ini (hasil analisa aktual)

| Fakta | Nilai |
|---|---|
| File renderer (JS/JSX) | **120 file** (`utils` 12 · `hooks` 13 · `components` 90 · `i18n` 3 · `App.jsx` · `main.jsx`) |
| File `.ts`/`.tsx` di src | **0** — mulai dari nol |
| Main process | **32 file** sudah `// @ts-check` + `tsconfig.check.json` (`checkJs: true`) → `npm run typecheck` 0 error |
| Toolchain | Vite 8 (esbuild: transpile TS native, **tanpa ubah config**) · Vitest (dukung TS) · `typescript@^7` · `@types/node` |
| Yang belum ada | `@types/react`, `@types/react-dom`, tsconfig renderer, typescript-eslint |
| File terbesar | `AgentChat.jsx` 1.446 baris · `ipcRenderer.js` 923 · `App.jsx` 949 · `SettingsView.jsx` 692 |
| Safety net | **512 test Vitest** + **7 e2e Playwright** — jaring pengaman migrasi |
| Runtime | Node (bukan Bun) — main process berjalan langsung `electron .` tanpa build step |

## Keputusan Arsitektur

### 1. Renderer → TypeScript murni (`.tsx`) — KEPUTUSAN: YA

Vite/esbuild sudah men-transpile `.tsx`; biaya migrasi di renderer praktis nol. Ini sumber nilai utama: 120 file yang selama ini tanpa tipe, plus shape drift antar komponen (project, config, session) yang sudah mulai terasa.

### 2. Main process → dua jalur, keputusan ditunda ke Fase 5

| Jalur | Biaya | Efek |
|---|---|---|
| **A. Tetap `.js` + JSDoc `@ts-check`** (rekomendasi) | 0 | Sudah ter-cover tsc penuh hari ini; tanpa build step |
| **B. TypeScript murni via bundler** (electron-vite / esbuild → `dist/`) | Menengah — ubah script dev, packaging, sourcemap | Sintaks TS asli di seluruh main process |

Node/Electron tidak menjalankan `.ts` langsung. Jalur B = menambahkan pipeline yang belum pernah ada (ini yang dilakukan Freebuff — tapi mereka memulai dengan Bun + build pipeline sejak awal). **Keputusan dibuat di Fase 5** berdasarkan kondisi riil saat itu; jalur A tidak menghalangi manfaat 90% dari tipe bersama di batas IPC.

### 3. Tipe bersama untuk batas IPC — KEPUTUSAN: YA, sejak Fase 1

Renderer dan main process berkomunikasi lewat IPC; bentuk payloadnya (Project, Config, session, status) melintasi batas. **Satu sumber tipe** yang dipakai dua sisi — renderer lewat `import type`, main process lewat `@typedef {import(...)}`:

```
src/types/shared.d.ts   ← Project, Config, PrayerConfig, Session, ProcessStatus, payload IPC
     ↑ import type        ↑ @typedef import(...)
     │                    │
  renderer (.tsx)      electron (.js + @ts-check)
```

Ini menutup gap terbesar tanpa menyentuh build main process.

## Prinsip Migrasi

1. **Strangler** — file dikonversi satu per satu; tidak ada fase "konversi semua".
2. **Bottom-up** — utils → hooks → komponen leaf → container → view. Komponen yang diimpor banyak dikonversi duluan.
3. **New code TS sejak hari pertama** — aturan wajib dari Fase 0; file baru `.tsx`, bukan `.jsx`.
4. **`any` di batas, bukan di dalam** — file JS yang belum dikonversi dianggap `any` saat diimpor dari TS (aman); `// TODO(ts): convert` sebagai penanda.
5. **Hijau tiap fase** — lint, typecheck, 512+ test, build, 7 e2e; CI gate tetap.
6. **Strict bertahap** — mulai `strict: false` (agar migrasi tidak macet), naikkan per folder setelah selesai.

## Fase Eksekusi

### Fase 0 — Fondasi & aturan main (S · 1 hari)

- Tambah `@types/react`, `@types/react-dom` (dev-only, nol dampak runtime).
- `tsconfig.app.json` untuk renderer: `module: ESNext`, `moduleResolution: bundler`, `jsx: react-jsx`, `allowJs: true`, `checkJs: false`, `lib: [ES2022, DOM]`, `noEmit`. `npm run typecheck` = `tsc -p tsconfig.check.json && tsc -p tsconfig.app.json`.
- Verifikasi: file `.tsx` percontohan (mis. komponen kecil Common) terbaca tsc + build + test tetap hijau.
- **Acceptance**: buat file TSX baru di src, `npm run typecheck` lulus, `npm run build` lulus, vitest lulus.

### Fase 1 — Tipe bersama batas IPC (M · 2–3 hari)

- Buat `src/types/shared.d.ts`: `Project`, `ProjectCommand`, `Config` (+ sub: prayer, terminal, notifications, autoRestart, preview, agent), `Session` (agent), `ProcessStatus`, `LogEntry`, `Preset`, payload request/response tiap channel inti.
- Sumber kebenaran: `electron/configSchema.js` (config), `projectHandlers.js` (project), `agentHandlers.js` (session), `processHandlers.js` (status).
- Wire ke electron via `@typedef` di handler yang relevan; pastikan dua sisi dicek dengan definisi yang sama.
- **Acceptance**: `channelRegistry.test.js` tetap lulus; error typecheck muncul saat payload renderer tidak cocok dengan kontrak main process.

### Fase 2 — Utils & lapisan data (M · 3–5 hari)

Urutan: `ipcRenderer.js` (923 baris — fondasi, semua komponen bergantung padanya) → `costEstimate.js`, `prayerTimes.js` (sudah JSDoc, tinggal rename) → hook data: `useElectronConfig`, `useProjects`, `useProcesses`, `usePrayerTimes`, `useAppHooks`, `useToasts`, `useActivities`, `usePresets`.

- `ipcRenderer.js` → `ipcRenderer.ts`: setiap wrapper `invoke` diberi tipe payload + return berdasarkan kontrak Fase 1 — efek terbesar ke seluruh app.
- **Acceptance**: utils & hooks 100% TS, komponen masih JS tidak patah (impor `any` aman), typecheck 0 error.

### Fase 3 — Komponen Common & Layout (M · 3–5 hari)

- `components/Common` (14): `Icon`, `Button`, `ToggleSwitch`, `AnimatedModal`, `VirtualList`, `ConfirmDialog`, dll — murni presentasional, tipe props mudah.
- `components/Layout` (5): `Sidebar`, `TopBar`, `MainLayout`, `PrayerWidget`, `TerminalWorkspace`(stateful).
- **Acceptance**: Common + Layout 100% TS; `MainLayout` dan `App.jsx` (masih JS) tidak patah.

### Fase 4 — View (L · 2–3 minggu, urutan berdasarkan ketergantungan)

| View | File | Catatan |
|---|---|---|
| Projects (4) | ProjectsView dll | Ringan, mulai di sini |
| Dashboard (5) | DashboardView 626 baris | Metrics + cards |
| Settings (7) | SettingsView 692 baris | Banyak prop drilling + i18n |
| Modals (9) | ProjectModal, PresetModal, CommandPalette | Form state kompleks |
| ProjectDetail (18) | GitTab 593, EnvironmentTab, LogsTab, AppPreviewTab | Tab per file |
| Terminal (1) | TerminalWorkspace | xterm typing |
| **Agent (12)** | **AgentChat 1.446 baris** (terakhir) | Terbesar + 104 test — convert paling akhir dengan jaring test penuh |

**Acceptance per view**: file view `.tsx`, e2e view terkait tetap lulus (project lifecycle, settings, agent chat).

### Fase 5 — Main process: keputusan jalur (L · opsional)

- Evaluasi ulang: kalau Node/Electron men-stabilkan **type stripping** (TS erasable tanpa kompilasi — arah yang sedang berjalan di Node), jalur B bisa jadi gratis.
- **Jalur A** (default): tutup dengan dokumentasi — main process tetap JSDoc, tipe bersama sudah menyambung dua sisi.
- **Jalur B** (pilih): pasang bundler untuk main process (electron-vite atau esbuild bundle → `dist/main.cjs`), ubah `dev`/`dev:electron`/build/packaging, convert 32 file, CI matrix tetap 3 OS.
- **Acceptance**: `electron .` di dev dan hasil packaging berjalan dari output bundel; seluruh handler test tetap hijau.

### Fase 6 — Pengetatan & quality (M · 1 minggu)

- `strict: true` bertahap per folder (mulai `strictNullChecks` — paling berdampak).
- `noUnusedLocals`, `noUncheckedIndexedAccess` (opsional, bisa menyakitkan — putuskan per folder).
- **typescript-eslint** — ganti/paralel aturan JS dengan aturan TS-aware (prefer `import type`, `consistent-type-imports`).
- **Acceptance**: `strict` aktif minimal di `src/types`, `src/utils`, `src/hooks`; lint 0/0; typecheck 0 error.

## Metrik Selesai (Definition of Done)

- [ ] **0 file `.js`/`.jsx` tersisa di `src/components`, `src/hooks`, `src/utils`, `src/i18n`** (kecuali `main.jsx` entry yang bisa ikut di-convert di akhir).
- [ ] `tsconfig.app.json` aktif dengan `strict: true` di folder yang ditargetkan.
- [ ] `npm run typecheck` 0 error (check.json electron + app.json renderer).
- [ ] 512+ test Vitest + 7 e2e tetap hijau setelah fase terakhir.
- [ ] Build `npm run build` menghasilkan output yang sama (struktur bundle tidak memburuk).
- [ ] Tidak ada `any` tanpa `// TODO(ts)` di file yang sudah dikonversi.

## Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| `AgentChat.jsx` 1.446 baris + pola streaming kompleks | Convert **paling akhir**, dengan 104 test + e2e agent sebagai jaring; pecah kecil-kecil per komponen anak |
| Pattern JS dinamis (event maps, dynamic import, ref lazy) | `any` bertanda `// TODO(ts)` dulu; jangan paksa generics di awal |
| React 19 typing (memo/forwardRef generics, ref callbacks) | Mulai non-strict; contoh pola dari file yang sudah convert |
| Migrasi setengah-setengah bikin dua gaya kode | Aturan wajib: file baru TS; konversi tidak pernah bolak-balik |
| Churn git besar per file | Konversi per file terpisah (rename + tipe), bukan gabung dengan perubahan fitur |
| Strictness bikin fase molor | Strict ditunda ke Fase 6; fase 0–5 pakai `strict: false` + tipe eksplisit |

## Pertanyaan yang Perlu Diputuskan Sebelum Eksekusi

1. **Tingkat strictness akhir** — `strict: true` penuh, atau `strictNullChecks` saja? (Rekomendasi: `strictNullChecks` wajib, sisanya bertahap.)
2. **Jalur main process** — A (JSDoc, default) atau B (bundler + TS murni)? Keputusan bisa ditunda ke Fase 5, tapi kalau sudah tahu ingin B, bundler sebaiknya dipasang **sebelum** Fase 1 (agar tipe bersama langsung TS-native).
3. **Batasan `any`** — boleh di mana saja dengan TODO, atau zero-`any` di file terkecil (Common) sejak awal? (Rekomendasi: zero-`any` di Common, toleransi di Agent.)

## Estimasi Total

- **Render minimum (Fase 0–4, main process jalur A)**: ±4–6 minggu paruh waktu, tanpa menghentikan pengembangan fitur (strangler bisa berjalan paralel).
- **Dengan main process jalur B (Fase 5)**: +1–2 minggu.
- **Dengan strict penuh (Fase 6)**: +1 minggu.

Setiap fase punya acceptance criteria sederhana: **"terverifikasi lewat typecheck + test + build"**, bukan "terlihat berjalan".
