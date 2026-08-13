# Changelog

Semua perubahan penting pada project ini dicatat di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/), dan project ini mengikuti [Semantic Versioning](https://semver.org/spec/v2.0.0.html) begitu versi rilis resmi ditetapkan.

## [Unreleased]

### Added

- **Pengingat Sholat** — widget pengingat waktu sholat yang tampil di sidebar (kartu di atas tombol Add project), topbar (pill), atau keduanya (bisa dinonaktifkan dari Settings):
  - Perhitungan **offline** memakai algoritma PrayTimes v2.3 (tanpa dependency), metode **Kemenag RI** sebagai default + MWL, ISNA, Egypt, Makkah, Karachi.
  - **Countdown live per detik** (timestamp-based, tidak drift) menuju sholat berikutnya, progress segment 5 sholat, dan panel **floating expand** dengan clock besar.
  - Cari kota via geocode (lewat IPC karena CSP renderer), fallback input manual lat/lng, penyesuaian ±menit per sholat, notifikasi sistem + suara (Web Audio).
  - Test golden values algoritma vs implementasi kanonik + test komponen widget.
- **Git tab di Project Detail** — status kerja, stage/unstage, commit, log, diff, checkout branch, pull/push, dan inisialisasi repo (`git init`), semuanya via IPC dengan validasi di main process.
- **Script runner tab** — menjalankan script `package.json` per project + health check dependency.
- **Sistem animasi** — `AnimatedModal` (entrance fade/scale + exit animation untuk semua 7 modal), toast slide-in/out, sliding indicator tab, transisi tema, press feedback global pada tombol, hover lift ProjectCard, entrance DropdownMenu, skeleton shimmer di tab Git & Scripts.
- **Preview embedded via WebContentsView** — menampilkan app project lewat native `WebContentsView` (sesi persisten per project: cookies/storage tidak hilang saat stop/start), mode focus dengan DevTools + tombol prev/next, dan fallback iframe bila view native tidak tersedia.
- **Logo stack berwarna asli** — logo SVG resmi per framework (Laravel, Next.js, React, Vue, Go, Node, dll.) di seluruh UI; untuk framework bertumpuk dipakai core stack (misal laravel-inertia-vue → Laravel).
- **Command palette v2** — navigasi keyboard penuh, preset, ikon SVG, dan perbaikan light theme.
- **Workspace preset v2** — kartu preset dengan badge status, edit modal (deskripsi/warna/stagger delay/auto-start), duplicate, reorder, progress start per project.
- **System environment check** — kartu di Settings mendeteksi 17 tools sistem (node, npm, git, php, composer, python, go, java, docker, mysql, redis, omp, dll) beserta versi & status, dengan tombol re-check.
- **Git tier 2** — stash (save/pop/apply/drop), discard working-tree changes per file (dengan konfirmasi), dan git blame di panel diff.
- **Dependency manager** — tab Dependencies: `npm outdated` jadi tabel interaktif (current/wanted/latest + tipe), update per package atau massal dengan backup otomatis `package.json.bak-*` + lockfile.
- **Env profiles & secrets** — quick-switch profile base/dev/staging/production di Environment tab, dan nilai rahasia (KEY/TOKEN/SECRET/PASSWORD) otomatis di-mask dengan toggle reveal.
- **Health & analytics** — tab Analytics per project: crash history (waktu, exit code), run history + uptime, total runs/uptime rata-rata, trend CPU/memory harian (bar chart), clear history; data dipersist ke `userData/health.json` (HealthManager, flush berkala).
- **Update checker** — cek rilis terbaru GitHub saat Settings dibuka; banner "versi baru tersedia" dengan tombol buka release.
- **JSDoc typecheck** — `npm run typecheck` (tsc, `tsconfig.check.json`) untuk file yang memakai `// @ts-check`; `npm run test:coverage` (vitest v8) tersedia.

### Changed

- **Layout Settings** — kartu settings di-center (`mx-auto`) dan memakai grid 2 kolom di layar lebar (`lg:grid-cols-2`) sehingga rapi di fullscreen.
- **Tab Git & Scripts** — skeleton loading saat inisialisasi.
- **Icon tombol** — perombakan seragam: ikon SVG menggantikan karakter teks (termasuk tombol ± di TerminalSettings).

### Fixed

- **Terminal interaktif di build produksi** — `node-pty` dipindah dari `devDependencies` ke `dependencies`; sebelumnya shell mati dengan *"node-pty is not available"* di app hasil instalasi.
- **PTY bocor (race condition)** — terminal yang dibuat setelah box ditutup kini langsung di-kill, tidak ada proses yatim.
- **Auto-scroll log tidak tersinkron** — toggle Auto-scroll di Settings kini berlaku di halaman Terminals dan Project Detail (dua arah, persist ke config).
- **Affordance shell exit** — saat shell mati (misal ketik `exit`) muncul overlay *"Shell exited with code X"* + tombol Restart.
- **Max log lines bisa 0** — input di-clamp minimal 100 agar tidak diam-diam membuang log.
- **Sidebar collapsed** — tombol Add project tidak lagi tenggelam di dark mode.
- **Topbar light mode** — tidak lagi hitam saat tema terang.

### Test

- `npm test` kini 11 script (bertambah `test-prayer-times` dengan golden values).
- Vitest: 97 test (widget PrayerWidget, GitTab, dan lainnya).
- E2E Playwright: 3 smoke test lulus.
