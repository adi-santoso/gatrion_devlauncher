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
- **Model picker di header chat** — dropdown model langsung dari chat: menampilkan model aktif (toleran suffix variant seperti `:high`), pilih model → tulis `modelRoles.default` (persisten) + `set_model` ke proses RPC yang berjalan (efek langsung), dan tautan "Manage models in Settings". Daftar model di-merge dari `models.yml` (eksplisit) **dan** `get_available_models` (authoritative, mencakup provider dengan `discovery` yang tidak mendaftarkan model di models.yml); handler `omp-get-models` kini menormalkan respons jadi array datar. Dropdown dilengkapi **kotak pencarian** (filter live + hitungan + empty state).
- **Thinking level control di header chat** — pill level thinking (off/minimal/low/medium/high/xhigh/max) yang membaca level aktif dari `get_state` dan mengirim `set_thinking_level` ke proses RPC. Rendering thinking sendiri sudah didukung: delta thinking dari `message_update` (text/thinking/toolcall deltas) tampil sebagai panel "Thinking" collapsible — siap dipakai begitu provider proxy menyediakan model dengan reasoning.
- **Konfirmasi delete session** — tombol hapus session di sidebar Agent kini memunculkan ConfirmDialog (nama session + peringatan riwayat lokal terhapus permanen) sebelum benar-benar menghapus.
- **Attachment gambar di chat Agent** — tombol paperclip + paste screenshot untuk melampirkan gambar ke pesan: downscale otomatis via canvas (maks 1568px, PNG dipertahankan, sisanya JPEG q0.85) untuk menghemat token vision & menjaga frame RPC tetap kecil; thumbnail preview dengan tombol hapus, batas 8 gambar/8 MB per file, dan peringatan saat model aktif tidak mendukung image (field `input` dari `get_available_models`). Gambar dikirim sebagai `images` (`ImageContent` omp) pada command `prompt` — didukung proxy yang punya model vision (misal `kuzu-*/gpt-5.6-luna`, `mimo-v2.5`, `minimax-m3`). Validasi mime/base64 + batas di main process.
- **Fix perhitungan context usage** — omp melaporkan `contextUsage.percent` dalam dua bentuk berbeda tergantung runtime: pecahan (`0.55` seperti di dokumentasi RPC) atau persen mentah (`30.63`). Perhitungan lama selalu mengalikan ×100 → indikator bisa meledak jadi 3063%. Kini kedua bentuk dinormalisasi (nilai > 1 dianggap sudah persen) dan di-clamp 0–100%. Plus regression test untuk bentuk persen mentah.
- **Agent session controls (Tier 1)** — enam fitur power-user di chat Agent, semuanya memakai RPC omp yang sudah terverifikasi:
  - **Context usage indicator** — progress bar persentase token konteks di header chat (dari `get_state.contextUsage`), warna accent → warning ≥70% → danger ≥90%, tooltip token/window; di-poll tiap 20 detik saat percakapan aktif dan di-refresh setelah tiap `agent_end`.
  - **Steer saat agent bekerja** — input chat **tetap aktif** selama agent streaming; kirim pesan saat busy → RPC `steer` (arahkan ulang di tengah kerja, bukan turn baru) + pesan user ditambahkan ke percakapan + hint "type a message to steer it mid-task".
  - **Menu "…" session options** (header) — **Compact context** (RPC `compact` + notifikasi sukses), toggle **Auto-compact** (`set_auto_compaction`, status dari `get_state`), toggle **Fast mode** (`set_fast_mode` — relevan untuk model `:high`/`:low`), toggle **Auto-retry** (`set_auto_retry`), semua optimistic dengan rollback.
  - **Panel Todos** — event `todo_reminder` (dan `todoPhases` dari `get_state`) dirender sebagai panel checklist mengambang di kanan chat: fase + task dengan status pending/in_progress/done, collapsible; `todo_auto_clear` mengosongkannya.
  - **Slash commands** — `get_available_commands` (event `available_commands_update` juga di-handle) muncul sebagai dropdown saat ketik `/` tanpa spasi, filter live per karakter, klik → sisipkan `/<command> ` ke input.
  - **Badge compacting/retrying** — event `auto_compaction_start/end` dan `auto_retry_start/end` menampilkan indikator sementara di header.
  - Backend: handler IPC baru `omp-compact`, `omp-set-auto-compaction`, `omp-set-auto-retry`, `omp-abort-retry`, `omp-set-fast-mode`, `omp-get-commands` + method OmpManager; docs IPC diperbarui.
- **UI chat Agent ala kreova (port penuh struktur, token devlauncher)** — area chat dire-styling meniru ChatPageV2 milik kreova sambil tetap memakai palet devlauncher (surface/ink, bukan cream/ink kreova):
  - **Layout flat ala Claude/kreova** — pesan user & assistant sama-sama tampil sebagai avatar (28px: "You" vs ikon accent) + kolom konten, **tanpa background bubble**; label `YOU/ASSISTANT` uppercase mono, timestamp, dan jarak antar pesan 26px.
  - **ThinkingBlock ala kreova** — label **"Thought process"**, chevron dalam kotak kecil ber-rotate, garis vertikal + konten indent, **default terbuka**, preview 120 char saat collapsed, 3-dot saat streaming.
  - **Actions jadi tombol teks** (bukan icon-only): Copy / Read aloud / Retry / Edit muncul saat hover, gaya kreova.
  - **Empty state ala kreova** — ikon gradient 64px + "What can I help you build?" + suggestion chips grid 2 kolom (tetap bisa diklik).
  - **Input bar ala kreova** — box `rounded-[13px]`, tombol attach 28px, textarea max-h 130px, tombol send 34px, hint mono di-center, bar input memakai warna page.
  - **Animasi kreova** — `dot-pulse` (typing dots) dan `cursor-blink` (kursor streaming) baru, FAB "Scroll to bottom" pill di tengah bawah dengan backdrop-blur.
  - Thumbnail gambar di pesan 128px dengan ikon expand saat hover (viewer fullscreen tetap ada).
- **UX chat Agent di-upgrade (port dari kreova Chat)** — area chat kini lebih modern dan informatif:
  - **Thinking dipersist per pesan** — reasoning yang ter-streaming kini ikut tersimpan di pesan assistant saat turn selesai (bukan hilang); panel "Thinking" **auto-open saat streaming**, dan saat collapsed menampilkan **preview 120 karakter** isi reasoning (plus indikator 3-dot saat masih berpikir).
  - **Actions per pesan saat hover** — Copy (sudah ada) + **Read aloud (TTS)** untuk pesan assistant + **Retry** (regenerate balasan terakhir dengan re-ask prompt yang sama) + **Edit and re-ask** untuk pesan user terakhir (edit inline dalam bubble → kirim ulang dengan prompt terkoreksi, riwayat setelahnya dipangkas).
  - **Badge token usage** — pesan assistant menampilkan `in · out` token dari `agent_end` usage.
  - **Thumbnail gambar di pesan terkirim** — gambar yang dilampirkan kini tampil sebagai thumbnail di bubble user (bukan hanya placeholder teks), klik → **viewer fullscreen** dengan backdrop blur.
  - **Stop mengawetkan partial reply** — saat generasi di-stop, teks yang sudah ter-stream disimpan sebagai pesan bertanda *"Generation stopped — partial reply kept"* (bukan dibuang); `agent_end` yang menyusul menggantinya dengan transkrip kanonik.
  - **Typing dots** saat agent bekerja tanpa output + **animasi masuk pesan** (fade/rise bertahap).
  - Refactor: bubble pesan dipisah ke `MessageBubble.jsx` (AssistantMessage/UserMessage) dan `ThinkingBlock.jsx`; handler event memakai ref agar selalu melihat state streaming terkini.
- **Agent session controls (Tier 2)** — lanjutan daftar fitur chat Agent:
  - **Export percakapan ke Markdown** — item "Export conversation" di menu "…" header; transkrip kanonik diambil dari omp (via `get_messages_page`, jadi percakapan panjang tidak pernah terpotong), di-render ke Markdown (`messagesToMarkdown`) lalu disimpan lewat save dialog native; notifikasi path hasil.
  - **Custom instructions (handoff)** — item "Custom instructions…" membuka popover di atas input; teks instruksi dikirim via RPC `handoff` (validasi panjang 2000 char di main process) dan berlaku untuk respons agent berikutnya.
  - **Live tokens/s** — saat agent bekerja, poll `get_state` dipercepat (5 detik) dan badge **tok/s** muncul di header saat `tokensPerSecond` tersedia.
  - **Panel subagent** — subscribe `set_subagent_subscription: progress` + poll `get_subagents` selama agent bekerja; aktivitas sub-agent dirender sebagai **chips** (nama/task + status dot + % progress) di atas input, dibersihkan saat turn selesai.
  - **Draft per session** — teks yang belum dikirim disimpan per session (ref, bukan state); pindah session tidak menghilangkan ketikan, kembali ke session mengembalikannya; draft terkirim dibersihkan.
  - **Live status notices** — event `notice`, `goal_updated`, `ttsr_triggered`, `irc_message` kini dirender sebagai notice inline (bukan diam-diam di-log).
  - **Pin session + search** — sidebar Agent: bintang untuk pin/unpin session (tersimpan di registry, session pinned diurutkan di atas) + kotak **pencarian session** (filter live per project, empty state khusus).
  - **Branch session (backend + IPC)** — `omp-branch`/`omp-get-branch-messages` di-wire (RPC `branch(entryId)` + `get_branch_messages`); UI konfirmasi entryId menyusul setelah verifikasi.
  - **Pagination history** — `ompGetMessages` kini memakai `get_messages_page` (cursor-based, hingga 200 halaman) dengan fallback ke `get_messages` lama bila paging tidak tersedia — riwayat panjang tidak lagi terpotong diam-diam oleh batas frame 1 MiB.
  - Backend: 7 handler IPC baru (`omp-export-conversation`, `omp-toggle-pin`, `omp-branch`, `omp-get-branch-messages`, `omp-set-subagent-subscription`, `omp-get-subagents`, `omp-handoff`) + method OmpManager; docs IPC diperbarui.
- **Bash interaktif di chat Agent** — tombol terminal di input bar membuka baris `$ command`; perintah dijalankan lewat RPC `bash` omp (cwd = folder project, batas 2000 char, deadline 5 menit) dan hasilnya dirender sebagai **blok terminal collapsible** per command: header `$ perintah` + status (running spinner / exit code / cancelled / timed out / failed), output mono scrollable, dan tombol **Stop** (RPC `abort_bash`) untuk command berjalan. Riwayat 6 run terakhir, tombol Clear. Catatan protokol: RPC omp mengembalikan `BashResult` saat command selesai (tidak ada event streaming per baris untuk command `bash`), jadi output tampil saat command berakhir/abort.
- **Notifikasi saat agent selesai** — saat turn selesai (`agent_end`) dan jendela app tidak fokus (mis. di-minimize atau window lain aktif), muncul system notification "Agent finished — <project>" berisi cuplikan jawaban; suara mengikuti pref `notifications.sound` global. Toggle **"Notify when finished"** di menu "…" header, dipersist ke config baru `agent.notifyOnFinish` (configSchema + validasi + test diperbarui).
- **Branch session dari pesan** — pesan yang berasal dari transkrip omp (memiliki `entryId`) kini punya aksi **"Branch"** saat hover; klik → RPC `branch(entryId)` memindahkan konteks session ke jalur baru (pesan setelahnya dipotong), transkrip langsung di-reload dari jalur branch, dan notice "Branched". Pesan lokal tanpa entryId tidak menampilkan aksi ini.
  - Backend: 2 handler IPC baru (`omp-bash`, `omp-abort-bash`) + method OmpManager (`bash` dengan timeout 5 menit, `abortBash`); docs IPC diperbarui.

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
- Vitest: 130 test (baru: 6 test renderer Markdown — heading, code fence, list, inline, quote, tabel, unclosed fence saat streaming; 22 test AgentChat — pesan pertama tidak terhapus, turn-scoped `agent_end` tidak menghapus turn sebelumnya, delta streaming burst tampil setelah flush, long-reply dirender literal tanpa parse markdown, thinking auto-open saat streaming + persist ke pesan setelah turn selesai, model picker switch dari header, counter karakter, search filter model, set thinking level, attach image → `ImageContent` + warning model non-vision + thumbnail & expand fullscreen, badge token in/out, retry re-ask, edit & re-send, stop mengawetkan partial reply, context usage indicator, steer saat busy, compact context, fast mode toggle, slash commands, dan todos panel; serta 3 test unit `fileToAttachment` — limits, fallback tanpa canvas, dan downscale 2000×1000 → 1568×784).
- E2E Playwright: 4 smoke test lulus (baru: navigasi ke Agent view via sidebar).
