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
- **AI Agent (oh-my-pi)** — menu **Agent** baru di sidebar (icon `message-square` konsisten dengan menu lain, bukan emoji AI) dengan session yang **dikelompokkan per project**:
  - **OmpManager** (main process) — RPC client NDJSON tanpa dependency: satu proses `omp --mode rpc` per project (spawn lazy, cwd = folder project), korelasi request/response by id, fast-fail cerdas saat provider belum dikonfigurasi, idle kill 15 menit (context aman karena session omp di disk), session registry di `userData/agent-sessions.json`.
  - **Chat streaming real-time** — dikalibrasi terhadap event nyata omp 17.x: `assistantMessageEvent.delta` untuk teks, `tool_execution_*` untuk tool cards (running → done), `agent_end.messages` sebagai transkrip akurat (fallback `get_messages`).
  - **Transisi dua arah** — tombol "Agent · N sesi" di header Project Detail → menu Agent (group project terseleksi); CTA "↗ buka project" di group session → kembali ke Project Detail.
  - **Session management** — new/rename/delete session per project, token usage per session, status bar omp (installed / provider ready / perlu setup).
  - **OmpInstaller** — install terkelola binary omp (±150 MB) ke `userData/omp/` tanpa admin rights: progress stream (bytes/percent) + verifikasi SHA256 dari `SHA256SUMS.txt`; deteksi otomatis omp sistem (PATH, `%LOCALAPPDATA%`, `~/.bun`).
  - **Settings → AI Agent (oh-my-pi)** — kartu lengkap: status/versi + tombol install dengan progress bar, **Run omp setup** (wizard provider dibuka di console sendiri), check update, daftar provider (dengan tombol hapus), **default model picker**, dan **form custom provider** (nama, base URL, API type, API key, daftar model, toggle auth header / disable strict tools) yang di-merge ke `~/.omp/agent/models.yml` dengan **backup otomatis** (js-yaml).

### Changed

- **Layout Settings** — kartu settings di-center (`mx-auto`) dan memakai grid 2 kolom di layar lebar (`lg:grid-cols-2`) sehingga rapi di fullscreen.
- **Tab Git & Scripts** — skeleton loading saat inisialisasi.
- **Icon tombol** — perombakan seragam: ikon SVG menggantikan karakter teks (termasuk tombol ± di TerminalSettings).
- **Agent status bar** — tombol "no provider configured" dan empty-state chat kini mengarah ke Settings (kartu AI Agent) alih-alih membuka docs.
- **Skala font desktop** — token ukuran teks Tailwind dinaikkan ±1–2px di `@theme` (`text-xs` 13px, `text-sm` 15px, `text-base` 17px, dst) sehingga seluruh app terbaca nyaman di monitor.

### Agent UI modern (polish penuh)

- **Chat ala aplikasi modern** (Claude Code / Freebuff): bubble user accent di kanan, pesan agent di kiri dengan avatar + tombol copy per pesan (muncul saat hover), render **markdown lengkap** — heading, bold/italic, inline code, code fence dengan header bahasa + tombol copy, list, blockquote, dan tabel.
- **Thinking section** — delta reasoning/thinking dari omp dirender sebagai panel "Thinking" yang bisa di-expand/collapse.
- **Tool cards baru** — ikon per tool (read/bash/grep/glob/dll), state running (spinner) → done (check), body hasil bisa di-expand, border accent saat bekerja.
- **Streaming** — kursor kedip, auto-scroll cerdas (hanya jika sudah di bawah) + tombol floating "jump to latest" saat scroll ke atas.
- **Empty state** — ikon besar + 4 saran prompt sekali klik (explain codebase, fix bug, refactor, tulis test).
- **Input bar** — textarea auto-grow, fokus ring accent, hint keyboard dengan kbd, tombol Stop merah saat generasi berjalan.
- **Sidebar sessions** — lebar 256px, group project dengan chevron, session card dengan hover action (rename/delete), tombol New session di header dan bawah group, badge omp + provider ready di status bar dengan dot pulse.
- **Ukuran teks naik di seluruh menu Agent** — body chat `text-sm`, meta `text-xs`/11px, tidak ada lagi teks 9–10px.
- **Loading session lama** — saat membuka session yang punya riwayat, tampil skeleton chat (spinner + bar shimmer meniru layout percakapan) sampai transkrip termuat — tidak ada lagi flash empty-state dengan saran prompt di session lama; session baru tetap langsung ke empty state.
- **Agent view keep-alive** — menu Agent kini tetap ter-mount (disembunyikan) saat berpindah ke menu lain, persis seperti preview keep-alive. Percakapan yang sedang berjalan, respon yang masih streaming, session yang dipilih, dan status busy **tidak hilang** saat pindah menu — kembali ke Agent langsung lanjut dari posisi terakhir.
- **Chat hilang saat kirim pesan pertama** — tiga akar masalah yang diperbaiki: (1) effect pemuat history di-key oleh `sessionPath` yang baru terisi setelah kirim pertama → memicu reset percakapan; kini di-key oleh `session.id`. (2) Fetch history dijalankan untuk session baru yang belum punya `sessionPath` — responsnya yang terlambat bisa menimpa pesan yang baru dikirim (bahkan bisa memuat history session lain); fetch kini dilewati untuk session tanpa path. (3) Session yang dibuat implisit oleh kiriman pertama dilindungi dari reset. Plus 2 regression test AgentChat (106 total).
- **Percakapan lama hilang setiap turn selesai** — temuan lewat spike binary omp asli: `agent_end.messages` **hanya berisi turn terakhir**, bukan seluruh sesi (turn 2 hanya membawa pesan turn 2). Handler lama mengganti seluruh `messages` dengan transkrip itu → setiap jawaban selesai, percakapan sebelumnya lenyap (muncul lagi hanya setelah pindah sesi, saat history di-reload dari disk). Kini `agent_end` **merge** turn terakhir ke riwayat yang sudah ada: pesan user dipertahankan di tempatnya, jawaban assistant final di-append. Plus regression test 2-turn (107 total).
- **App hang saat AI mengetik** — dua penyebab renderer jenuh saat streaming yang diperbaiki: (1) **semua pesan lama di-render ulang setiap delta** — `MessageView` tidak di-memo, jadi tiap delta (bisa puluhan per detik) men-trigger re-parse markdown untuk SEMUA pesan assistant besar; kini di-`React.memo` sehingga hanya blok streaming yang re-render. (2) **Render per delta** — delta kini di-buffer dan di-flush per 30ms (render rate dibatasi), plus perbaikan pembacaan ref yang lazy di updater (nilai buffer ditangkap sebelum di-clear). Plus regression test streaming burst (108 total).
- **App masih hang di tengah balasan panjang** — root cause: tiap flush 30ms meng-parse **Markdown penuh dari seluruh teks yang sudah ter-akumulasi** (`<Markdown content={streaming} />`); untuk balasan panjang/me-dump output tool, biaya parse per flush melampaui interval → renderer jenuh permanen. Perbaikan: (1) streaming kini **plain text** (whitespace-pre-wrap, tanpa parse) untuk teks di atas 12k char — balasan pendek tetap markdown live, dan pesan final selalu di-render Markdown penuh sekali saat turn selesai; (2) **delta thinking di-buffer** dan di-flush di interval yang sama (sebelumnya `setThinking` per event → render ulang per event); (3) **tool output update di-buffer** juga (bisa stream ratusan chunk/detik, sebelumnya `setTools` per event). Plus 2 regression test: long-reply tetap literal (tidak di-parse jadi `<strong>`) dan thinking ter-flush (110 total).
- **Chatbox auto-grow** — textarea kini tumbuh mengikuti isi (sampai ±10 baris, lalu scroll), bukan kotak 1 baris yang scroll di dalam; reset otomatis setelah kirim, plus **counter karakter** di baris hint, dan input otomatis fokus saat membuka session.
- **Model picker di header chat** — dropdown model langsung dari chat (sumber `~/.omp/agent/models.yml`, sama dengan Settings): menampilkan model aktif (toleran suffix variant seperti `:high`), pilih model → tulis `modelRoles.default` (persisten) + `set_model` ke proses RPC yang berjalan (efek langsung), dan tautan "Manage models in Settings".

### Fixed

- **Terminal interaktif di build produksi** — `node-pty` dipindah dari `devDependencies` ke `dependencies`; sebelumnya shell mati dengan *"node-pty is not available"* di app hasil instalasi.
- **PTY bocor (race condition)** — terminal yang dibuat setelah box ditutup kini langsung di-kill, tidak ada proses yatim.
- **Auto-scroll log tidak tersinkron** — toggle Auto-scroll di Settings kini berlaku di halaman Terminals dan Project Detail (dua arah, persist ke config).
- **Affordance shell exit** — saat shell mati (misal ketik `exit`) muncul overlay *"Shell exited with code X"* + tombol Restart.
- **Max log lines bisa 0** — input di-clamp minimal 100 agar tidak diam-diam membuang log.
- **Sidebar collapsed** — tombol Add project tidak lagi tenggelam di dark mode.
- **Topbar light mode** — tidak lagi hitam saat tema terang.
- **AgentChat safety timeout** — fallback refresh 20 detik dulu bisa menimpa generasi yang masih berjalan (menandai busy=false + refresh history di tengah streaming); sekarang hanya aktif jika tidak ada event RPC sama sekali selama 8 detik.
- **Session agent tidak bisa di-resume** — `new_session` di protokol RPC omp tidak mengembalikan path file sesi, jadi `session.sessionPath` selalu null dan klik session lama menampilkan chat kosong (baik setelah restart maupun saat berpindah session dalam satu run). Sekarang path sesi dibaca dari `get_state` setelah `new_session` dan disimpan di registry — klik session mana pun otomatis `switch_session` + `get_messages`, dan percakapan bisa dilanjutkan di sesi yang sama. Diverifikasi end-to-end dengan binary omp asli (create → restart → resume → continue).

### Test

- `npm test` kini 14 script (bertambah `test-omp-manager` untuk session registry + normalizeMessages, dan `test-omp-config` untuk read/write/merge/delete models.yml & config.yml dengan backup).
- Vitest: 112 test (baru: 6 test renderer Markdown — heading, code fence, list, inline, quote, tabel, unclosed fence saat streaming; dan 8 test AgentChat — pesan pertama tidak terhapus, turn-scoped `agent_end` tidak menghapus turn sebelumnya, delta streaming burst tampil setelah flush, long-reply dirender literal tanpa parse markdown, thinking ter-flush, model picker switch dari header, dan counter karakter).
- E2E Playwright: 4 smoke test lulus (baru: navigasi ke Agent view via sidebar).
