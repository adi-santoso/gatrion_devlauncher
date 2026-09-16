# Audit Project Detail — fitur, UI/UX, dan rekomendasi

Tanggal: 16 September 2026

Baseline: `4af0d79` — `fix(ui): improve agent session UX and fullscreen preview layout`

## Hasil implementasi — 16 September 2026

Perbaikan atas kelompok temuan **PD-01–PD-17** sudah diterapkan. Temuan di bagian berikutnya tetap merekam kondisi baseline; status terbaru dijelaskan di sini.

### Perbaikan yang diterapkan

- **PD-01/02/15:** panel Environment mempertahankan draft per proyek melalui navigasi dan fullscreen; respons baca usang ditolak. Save mengirim mtime yang dibaca dan menolak perubahan eksternal. Daftar/isi file mempunyai reload terpisah, chip file absent benar-benar disabled, dan refresh tidak membuang draft. Baris variabel modal memakai ID editor stabil; mengetik dan menghapus baris sebelumnya tidak mengganti input yang sedang diedit.
- **PD-03/10/11:** Git terisolasi berdasarkan path, mempunyai guard request dan mutasi, serta menahan busy sampai refresh selesai. Untracked diff menampilkan konten, discard memanggil recycle bin, stash menyertakan untracked, publish membuat upstream origin, dan drop stash memerlukan konfirmasi. Status menggunakan porcelain NUL-delimited untuk Unicode, spasi, dan rename. Shortcut commit tidak dapat mengirim mutasi kedua.
- **PD-04/05/12:** exit 1 hanya diterima untuk hasil JSON `npm outdated` yang valid; install/update gagal diteruskan sebagai error. Parser Composer/Cargo mengikuti bentuk CLI yang benar; parser Go menangani nested JSON/string dan menolak output rusak. Error scan/plugin tidak ditampilkan sebagai sehat. Resolusi manager bersama mengikuti deklarasi `packageManager`, kemudian lockfile. Update kompatibel dijelaskan sesuai constraint; backup gagal menghentikan update dan nama backup aktual ditampilkan. pip memakai interpreter virtualenv lokal yang dijalankan langsung, termasuk path dengan spasi.
- **PD-06:** Scripts dan Custom Commands memakai registry task per proyek dengan run ID numerik, guard duplicate start/stop, sinkronisasi antarkonsumen, polling status, hasil exit dan kode keluar. Backend menyimpan completion, termasuk spawn error; stop run selesai idempotent. Install sukses memicu pemeriksaan dependency ulang. Tombol Open output mengarah ke Terminal.
- **PD-07/16:** tab terakhir disimpan per proyek, Logs Laravel tidak dibawa ke Node, panel data di-mount saat pertama dibuka, dan panel yang sudah dibuka tetap hidup saat fullscreen. Overflow horizontal dibatasi pada strip tab; underline mengikuti resize/bahasa dan tab aktif digulirkan ke area terlihat. Header diringkas, shell/output dapat di-resize.
- **PD-08/09:** reset zoom 100 dikirim ke native view, pilihan zoom diterapkan lagi setelah DOM siap, serta emulasi diterapkan setelah view dibuat. Simulator memakai parent native yang memotong area tampilan tanpa mengubah resolusi halaman; perangkat tinggi dapat digulir di fullscreen 1024×600. State starting/stopping/error dibedakan, kegagalan navigasi ditampilkan dengan Retry, port yang ditambahkan terdeteksi, dan clear-site-data memberi feedback termasuk pada preset mobile.
- **PD-13/14:** Analytics menghapus error usang, menyediakan retry/refresh dan waktu pembaruan, refresh saat aktif/status berubah, memeriksa hasil clear, dan menjelaskan retensi 200 run/100 crash. Filter warning+search+source bekerja bersama. Laravel log memiliki live tail opt-in, refresh daftar/rotation, virtualisasi, empty state, dan pembacaan tail maksimal 2 MB. Output proses terfilter dapat disalin.
- **PD-17:** label, empty state, aksi, dialog, serta feedback utama Project Detail dan modal proyek memakai terjemahan Inggris/Indonesia. Tab mendukung Arrow/Home/End, roving tabindex, dan relasi tabpanel. Path berupa tombol; field editor berlabel; notifikasi memiliki live region. Modal bersama mengelola fokus, Tab, Escape, serta pengembalian fokus.
- Settings menampilkan preview host, tags, dependency project, proses tambahan, custom commands, dan penjelasan kapan konfigurasi tersimpan memerlukan restart.

### Verifikasi hasil perbaikan

- **953 unit/integration test lulus, 102 file** (`vitest --maxWorkers=4`). Baseline 910 test; bertambah 43 kasus.
- **17 E2E lulus**: sembilan skenario Project Detail existing, satu skenario regression Indonesia 1024×600, dan tujuh skenario Agent untuk melindungi perubahan modal bersama. Setelah perubahan terakhir pada native clip visibility dan quoting runner, dua E2E yang terdampak dijalankan ulang dan lulus.
- `npm run typecheck` dan `npm run build:main` lulus.
- `npm run lint`: **0 error, 8 warning** pada file yang sudah memiliki kategori warning sebelumnya (max-lines dan unused import test). ProjectModal, AppPreviewTab, dan PreviewManager sudah di bawah batas lint melalui extraction komponen/helper.
- `git diff --check` lulus; peringatan konversi LF→CRLF berasal dari konfigurasi Git Windows.
- Regression Electron memeriksa **native** zoom 1.5→1, iPhone SE `innerWidth=375`, `innerHeight=667`, DPR=2, ukuran tetap ketika wrapper digulir, laptop width=1366, serta tombol clear data dan toolbar fullscreen yang tetap bisa digunakan.
- Regression Indonesia/light/1024×600 memeriksa overflow halaman, draft A→B→A/fullscreen, save ke file A tanpa mengubah B, task exit sukses, input `FOO_LONG_KEY` per karakter, fokus, dan keyboard tab.
- Git untracked/stash/publish diverifikasi pada repositori fixture dan **remote bare lokal**. Recycle-bin bridge diverifikasi dengan mock, bukan menghapus file pengguna.

Perintah pengujian lengkap:

```powershell
# Jalankan dari root repo; direktori runtime disiapkan di dalam repo.
$env:TEMP = "$PWD\tests\.runtime"
$env:TMP = $env:TEMP
$env:HOME = $env:TEMP
$env:USERPROFILE = $env:TEMP
npx vitest run --maxWorkers=4
npm run typecheck
npm run lint
npm run build:main
npx playwright test e2e/preview.fullscreen.spec.js e2e/preview.device.spec.js e2e/preview.persistence.spec.js e2e/project.terminal.spec.js e2e/laravel.logs.spec.js e2e/env.editor.spec.js e2e/app.flows.spec.js e2e/project.detail.regressions.spec.js e2e/agent.spec.js
```

Fixture E2E sekarang dibuat di `test-results/fixtures`. Fixture unit memakai `tests/.runtime` pada sesi verifikasi ini; `GIT_CEILING_DIRECTORIES` di setup mencegah fixture non-repository menemukan `.git` repo aplikasi di parent. Hindari menjalankan unit dan E2E bersamaan dengan temp unit di `test-results`, karena Playwright membersihkan direktori output itu.

### Batas aktual dan pekerjaan lanjutan

- Bun dan Yarn modern belum mempunyai adapter scan UI penuh; aplikasi menampilkan keterbatasan secara eksplisit dan mengarahkan ke shell. Dukungan scan Node yang diimplementasikan adalah npm, pnpm, serta tabel JSON Yarn Classic.
- Upgrade nyata melalui registry Composer/Go/pip/Cargo/Node dan push/pull ke remote internet belum diuji; fixture parser, runner, backup failure, serta remote Git lokal sudah diuji.
- Draft dipertahankan selama lifetime aplikasi/panel, belum menjadi penyimpanan draft lintas restart. Proteksi file eksternal menggunakan pemeriksaan mtime sebelum backup/write, bukan file lock transaksional.
- Task registry menggunakan polling satu detik; Open output membuka tab Terminal. Task Center penuh, output terfilter per run, dan event completion terpusat masih pengembangan lanjutan.
- Pesan mentah dari CLI/backend tetap ditampilkan sebagaimana diterima. Audit rasio kontras menyeluruh dan seluruh kombinasi OS/perangkat belum dilakukan.
- Branch picker, grouping stack trace, export file log, profile launch environment nyata, Health panel, split preview/Agent, dan toolkit screenshot tetap rekomendasi fitur lanjutan pada bagian 5.

## Kesimpulan

Project Detail sudah memiliki fondasi fitur yang luas: preview native, simulator perangkat, shell persisten, log proses dan Laravel, Git, script runner, pengelolaan dependency, editor environment, analytics, serta konfigurasi project.

Prioritas berikutnya adalah **ketepatan state dan hasil operasi**, lalu **layout serta navigasi**, kemudian **fitur baru yang mempercepat diagnosis masalah**. Ada bug yang berhasil direproduksi meskipun pengujian existing lulus, terutama pada pergantian project, respons asynchronous, status task, dan integrasi package manager.

### Cara membaca bukti

- **Runtime:** diamati melalui Electron/Playwright dengan project dan data pengujian terisolasi.
- **Diagnostik:** direproduksi dengan pengujian komponen, parser, atau runner menggunakan input terkontrol.
- **Review kode:** disimpulkan dari implementasi dan alur pemanggilan; belum diuji end-to-end untuk skenario tersebut.
- P1: perbaikan penting sebelum memperluas fitur terkait. P2: perbaikan penggunaan sehari-hari. P3: peningkatan lanjutan.

## Lingkup dan verifikasi

- Seluruh komponen di `src/components/ProjectDetail/` ditinjau, termasuk integrasi `AppProjectDetail`, shell, modal edit project, serta handler/backend terkait.
- Tampilan seluruh sembilan tab Laravel diperiksa pada 1024×600; beberapa tampilan juga diperiksa pada 1440×900, tema terang, dan bahasa Indonesia.
- **82 test existing lulus di 9 file**: test Project Detail dan integrasi `AppProjectDetail`.
- **9 test E2E existing lulus di 7 spec**: lifecycle project, persistensi settings, env editor, Laravel logs, simulator, fullscreen preview, persistensi URL, dan shell interaktif.
- **11 diagnostik sementara berhasil mereproduksi bug**, ditambah satu skenario audit Electron yang mencakup navigasi lintas project, script cepat selesai, Git untracked, preview, layout, dan input modal. Diagnostik tersebut mengassert perilaku bug; kelulusannya bukan tanda fitur sudah benar.
- Pengujian existing masih mengeluarkan warning React `act(...)`.
- Push/pull remote nyata, upgrade dependency nyata lintas ekosistem, dan seluruh kombinasi perangkat/platform tidak diuji. Kontrak Composer/Cargo diperiksa terhadap source upstream dan direproduksi dengan bentuk JSON yang sesuai.
- Screenshot halaman renderer dipakai untuk menilai layout. Area native WebContentsView yang tampak hitam di screenshot tidak dengan sendirinya membuktikan kegagalan rendering halaman native; ukuran DOM/native state diperiksa terpisah.

Perintah verifikasi existing:

```sh
npx vitest run src/components/ProjectDetail/__tests__ src/__tests__/AppProjectDetail.test.jsx
npx playwright test e2e/preview.fullscreen.spec.js e2e/preview.device.spec.js e2e/preview.persistence.spec.js e2e/project.terminal.spec.js e2e/laravel.logs.spec.js e2e/env.editor.spec.js e2e/app.flows.spec.js
```

## 1. Inventaris fitur

### Header dan lifecycle project

Tersedia: identitas framework, nama/path, status, Start/Stop/Restart, buka browser, pindah ke Agent, Explorer, editor eksternal, Edit, Duplicate, PID, uptime, CPU/RAM, command, dan status beberapa proses. Crash banner menyediakan detail error dan Restart. Start project juga mempunyai penanganan port conflict dan startup dependency project melalui integrasi aplikasi/backend.

Yang sudah baik: aksi lifecycle menjadi aksi utama; error startup memiliki feedback; aksi jarang dipakai dikelompokkan dalam menu. Lifecycle Start/Stop dan streaming log lulus E2E. Rekomendasi: header kompak, identitas project tetap terlihat saat scroll, dan shortcut langsung menuju output ketika startup gagal.

### App / Preview

Tersedia: preview native dengan fallback iframe, keep-alive per project, address bar, back/forward, reload, browser eksternal, zoom, fullscreen, navigasi antarproject di fullscreen, DevTools fullscreen, clear site data, preset perangkat, ukuran custom, rotasi, dan persistensi pilihan perangkat. Backend menyediakan emulasi DPR/touch/user-agent untuk preset terkait.

Yang sudah baik: preview mempertahankan URL ketika reload/re-show; layout full-bleed dan persistensi preview mempunyai regression test. Back navigation juga berhasil diperiksa pada audit runtime. Perbaikan placeholder fullscreen sebelumnya tetap dilindungi test.

### Terminal dan custom commands

Tersedia: Start/Close shell eksplisit per project, PTY persisten selama navigasi, copy/paste, command history, interrupt, restart setelah shell exit, menjalankan/menghentikan custom command, serta output proses.

Output proses memiliki pencarian dengan highlight, filter tipe, timestamp, label command, auto-scroll, Jump to latest, Clear, font mengikuti konfigurasi, dan virtualisasi daftar panjang. Shell dan interaksi keyboard utama lulus E2E.

### Logs khusus Laravel

Tersedia: daftar file `storage/logs/*.log`, ukuran file, pembacaan tail 5.000 baris, timestamp/level berwarna, search, reload manual, serta Jump to latest. Pemilihan file dan pembacaan log lulus pengujian existing.

### Git

Tersedia: branch/upstream/ahead-behind, status file, stage/unstage per file dan massal, diff, blame, commit dengan Ctrl/Cmd+Enter, pull/push, checkout/create branch, initialize repository, stash save/pop/apply/drop, discard, dan recent commits.

Yang sudah baik: cakupan operasi cukup luas dan beberapa operasi memiliki feedback serta konfirmasi. Test existing terutama melindungi tampilan status, staging, commit, push confirmation, dan init; bukan seluruh operasi Git nyata.

### Scripts

Tersedia: daftar script `package.json`, Run/Stop, deteksi package manager dari lockfile, pemeriksaan keberadaan `node_modules`, install dependency, reload, dan output ke Terminal. Menjalankan script cepat dan menerima output/exit log berhasil diperiksa saat audit runtime.

### Dependencies

Tersedia: scan outdated dan update untuk npm, Composer, Go, pip, Cargo; tampilan Current/Wanted/Latest; update per package; Update all untuk npm/Composer; pesan kebutuhan plugin Cargo. Beberapa backend menyediakan backup manifest/lockfile.

Catatan: luasnya daftar manager belum diikuti ketepatan seluruh kontrak/parser dan hasil operasi. Ini salah satu area dengan prioritas perbaikan tertinggi.

### Environment

Tersedia: launcher environment variables, indikator secret tersimpan, list/select `.env*`, read/edit/save/discard, syntax highlighting, masking/reveal secret di read mode, backup saat save, dan konfirmasi perubahan belum disimpan ketika memilih file lain.

Catatan: chip Profile hanya memilih file untuk dibaca/diedit. Chip itu belum mengaktifkan environment launch tertentu.

### Analytics

Tersedia: jumlah run selesai, total/average uptime, crash history, recent runs, grafik rata-rata CPU/memory harian, dan clear history. Backend membatasi penyimpanan recent runs, crash, serta resource samples.

### Settings dan modal Edit Project

Settings menampilkan ringkasan read-only dan Remove Project; penghapusan unregister project dijelaskan tanpa menghapus file disk. Modal edit mencakup nama/path/type/port, preview host, command utama/tambahan, env vars, auto-start, tags, custom commands, dan dependency antarproject.

## 2. Temuan P1 — ketepatan data dan operasi

### PD-01 — Environment dapat menampilkan isi project yang salah dan kehilangan draft

**Bukti: Runtime + diagnostik.** Draft `.env` project A hilang setelah membuka B lalu kembali ke A; tidak ada dialog pada perpindahan project. Respons read A yang ditunda juga dapat menimpa isi B setelah B selesai dimuat.

**Dampak:** kehilangan input dan konteks isi file yang keliru. Jika pengguna mengedit/menyimpan isi yang salah tersebut, target save mengikuti project aktif; overwrite lintas konteks ini merupakan risiko turunan, bukan operasi yang dilakukan saat audit.

**Perbaikan:** state/draft keyed oleh `projectId + fileName`, request generation guard, identitas target save yang stabil, dan penanganan draft saat project berganti maupun panel unmount karena fullscreen. Periksa perubahan file eksternal sebelum menimpa isi yang sudah dibaca.

Sumber: `src/components/ProjectDetail/EnvironmentTab.tsx:67-137`; `src/components/ProjectDetail/ProjectDetailView.tsx:216-239`.

### PD-02 — Input nama environment variable kehilangan fokus tiap karakter

**Bukti: Runtime.** Mengetik `FOO` secara normal pada KEY di modal Edit Project menghasilkan hanya `F`. React key baris menggunakan nilai key yang sedang diedit, sehingga input diganti ketika nilainya berubah.

**Perbaikan:** identitas baris stabil, terpisah dari isi field. Acceptance: ketik nama panjang, gunakan backspace/arrow, lalu pindah field tanpa kehilangan fokus.

Sumber: `src/components/Modals/ProjectModal.tsx:417-423`.

### PD-03 — Git mempertahankan data project lama sementara operasi memakai project baru

**Bukti: Diagnostik.** Saat B masih loading, file A tetap ditampilkan dan checkbox masih enabled. `refresh` tidak mereset state atau menolak respons project sebelumnya.

**Dampak:** pengguna dapat memilih file berdasarkan data lama sementara handler menggunakan path project aktif. Eksekusi perubahan pada repository yang salah tidak dilakukan saat audit.

**Perbaikan:** cache per project, request guard, loading state yang tidak actionable, serta snapshot project/path untuk operasi dan dialog. Draft commit/branch/stash harus memiliki konteks project yang jelas.

Sumber: `src/components/ProjectDetail/GitTab.tsx:29-95`; `src/components/ProjectDetail/gitTabSections.tsx:107-145`.

### PD-04 — Kegagalan npm update/install dengan exit code 1 dianggap berhasil

**Bukti: Diagnostik runner.** Simulasi `npm install demo@latest` dengan stderr ERESOLVE dan exit 1 menghasilkan Promise resolved, bukan rejection. Pengecualian exit 1 untuk `npm outdated` diterapkan ke seluruh command.

**Perbaikan:** aturan exit code per operasi; hanya `outdated` menerima exit 1 yang sesuai hasil outdated valid. Propagasikan stderr dan hasil aktual ke UI. Tambahkan kasus ERESOLVE, kegagalan jaringan, dan timeout.

Sumber: `electron/utils/npmRunner.ts:57-66`; `electron/handlers/repoHandlers.ts:419-432`.

### PD-05 — Hasil dependency scan dapat menyatakan kondisi sehat secara keliru

**Bukti: Diagnostik + kontrak upstream.**

- Composer upstream mengeluarkan `installed` sebagai array dengan `name/version/latest`; parser mengharapkan object keyed by name dengan `current`. Input valid menjadi daftar kosong.
- Cargo upstream memakai string `project/compat/latest`; parser mengharapkan `project` berupa array object. Input valid menjadi daftar kosong.
- Error scan diubah menjadi `present:false`, kemudian section error disembunyikan. Bila semua manager gagal, UI mengatakan manifest tidak ditemukan dan tidak menyediakan Re-check.
- Plugin Cargo yang tidak tersedia menampilkan notice sekaligus **Up to date**.

**Perbaikan:** pisahkan discovery manifest dari scan, normalisasi format CLI yang benar, validasi schema hasil, dan bedakan `not detected / not checked / checking / failed / current / outdated`. Gagal parse tidak boleh menjadi daftar sehat kosong.

Sumber: `electron/handlers/dependencyHandlers.ts:28-43,108-129`; `src/components/ProjectDetail/DependenciesTab.tsx:101-145,206-265`.

### PD-06 — Status script dan custom command tidak tersinkron dengan proses

**Bukti: Runtime untuk Scripts; review kode untuk CustomCommands.** Script yang sudah exit masih menampilkan Stop. Pindah ke project lain dengan nama script sama juga membawa status Stop. `runStore` pada Scripts ditulis tetapi tidak dibaca untuk memulihkan state. Backend menghapus run saat exit, tetapi komponen tidak memakai event/polling status run untuk menyinkronkannya.

CustomCommands juga memakai state awal yang tidak disinkronkan saat project berubah, mengabaikan hasil gagal tanpa feedback, dan masih memungkinkan menjalankan command yang sama saat run sebelumnya aktif.

**Perbaikan:** satu registry task per `projectId + taskId + runId`, status starting/running/succeeded/failed/stopped, event completion, rekonsiliasi saat kembali ke view, serta output dan exit code terikat pada run. Hindari menampilkan Stop untuk run yang sudah selesai.

Sumber: `src/components/ProjectDetail/ScriptsTab.tsx:7-12,59-60,80-109,228-245`; `src/components/ProjectDetail/CustomCommands.tsx:19-49`; `electron/managers/ProcessManager.ts:198-240`.

## 3. Temuan P2 — alur kerja, layout, dan kejelasan

### PD-07 — Tab overflow dan active tab tidak valid setelah pindah framework

**Bukti: Runtime.** Pada 1024×600 dengan sidebar expanded, tab Laravel membutuhkan 835 px pada container 730 px; konten utama overflow horizontal 81 px. Settings berada di luar area awal. Membuka Logs Laravel lalu project Node menghasilkan nol tab selected, tetapi panel Laravel Logs masih terlihat.

**Perbaikan:** overflow hanya pada strip tab dengan affordance scroll/More; validasi active tab terhadap kapabilitas project; simpan tab terakhir per project. Underline juga perlu dihitung ulang saat resize/perubahan daftar tab: screenshot menunjukkan underline tidak selalu mengikuti label aktif setelah perubahan layout.

Sumber: `src/components/ProjectDetail/TabNavigation.tsx:27-69`; `src/components/ProjectDetail/ProjectDetailView.tsx:67,159,218-220`.

### PD-08 — Zoom 100% dan ukuran simulator fullscreen tidak sesuai tampilan

**Bukti: Runtime.** Setelah 150% lalu memilih 100%, native WebContents tetap mempunyai zoom factor `1.5`. Effect melewati nilai 100. Di fullscreen 1024×600, screen iPhone SE berukuran 375×667, top 2,5 dan bottom 669,5; bagian perangkat keluar viewport dan area atas masuk ke kawasan toolbar.

**Perbaikan:** selalu kirim zoom termasuk 100%; definisikan interaksi zoom dengan emulasi. Bedakan ukuran viewport emulasi dan skala tampilannya agar perangkat bisa fit atau discroll tanpa mengubah target media query. Toolbar fullscreen perlu memberi address bar ruang minimum dan memindahkan aksi sekunder ke menu saat sempit.

Sumber: `src/components/ProjectDetail/AppPreviewTab.tsx:183-188,339-393,444-468`.

### PD-09 — Preview belum memiliki state readiness/loading/error yang lengkap

**Bukti: Review kode.** `starting/stopping/error` semuanya menggunakan placeholder Not Running dengan tombol Start. Kegagalan `loadURL` dicatat di main log tetapi tidak menjadi error state renderer. Pemilihan native mode hanya dilakukan saat mount, sehingga project yang awalnya tanpa port tetap memakai fallback setelah port ditambahkan selama mount yang sama.

**Perbaikan:** state menunggu server, loading halaman, load failed, dan retry; CTA sesuai status. Tampilkan detail URL/error dan View logs. Native capability harus dievaluasi kembali saat port valid. Clear site data perlu feedback selesai/gagal; di fullscreen mobile preset, aksi ini ikut tersembunyi bersama DevTools walaupun bukan operasi debugger.

Sumber: `src/components/ProjectDetail/AppPreviewTab.tsx:51-69,378-383,453-456`; `src/components/ProjectDetail/PreviewPlaceholder.tsx`; `electron/managers/PreviewManager.ts:260-277,316-324`.

### PD-10 — Beberapa aksi Git tidak cocok dengan jenis file/state

**Bukti: Runtime + review kode.** Untuk file untracked, Diff mengembalikan string kosong dan Discard melalui `git restore` gagal pathspec. Stash menggunakan `git stash push` tanpa include-untracked, meski UI memperhitungkan untracked sebagai pekerjaan yang dapat distash. Branch tanpa upstream tidak mempunyai jalur publish; Push disabled ketika ahead=0.

**Perbaikan:** preview konten file baru, aksi berbeda untuk menghapus file untracked, opsi include-untracked pada stash, tampilkan output stash sebenarnya, dan alur publish branch/set upstream. Branch picker dengan search akan lebih mudah daripada input nama manual. Drop stash layak mendapat identitas stash yang jelas dan konfirmasi/opsi pemulihan karena menghilangkan satu-satunya referensi UI ke pekerjaan tersimpan.

Sumber: `src/components/ProjectDetail/gitTabSections.tsx:111-145,193-220`; `src/components/ProjectDetail/gitTabExtras.tsx:43-48`; `electron/handlers/repoHandlers.ts:207-214,279-285,307-312`.

### PD-11 — Shortcut Git melewati busy state

**Bukti: Diagnostik.** Ctrl+Enter dapat memanggil commit kedua ketika tombol Commit sudah disabled. Enter checkout/stash dan checkbox file juga belum memakai guard operasi yang konsisten.

**Perbaikan:** guard di handler, bukan hanya disabled di tombol; serialisasi mutasi repository dan tampilkan nama operasi aktif. Jangan melepas busy sebelum refresh state pascaoperasi selesai.

Sumber: `src/components/ProjectDetail/GitTab.tsx:70-86`; `src/components/ProjectDetail/gitTabSections.tsx:114-119,212,369-383`; `src/components/ProjectDetail/gitTabExtras.tsx:28`.

### PD-12 — Package manager dan janji versi update tidak konsisten

**Bukti: Review kode.** Install dependency mengikuti lockfile, tetapi Run script selalu `npm run`; scan/update Node juga selalu npm. Update all mengklaim latest, tetapi `npm update` mengikuti range manifest; update individual memakai `npm install name@latest`. Composer/Cargo juga memiliki batas constraint masing-masing. pip dipanggil dari PATH, bukan interpreter/venv project yang dipilih, dan UI menyebut backup requirements yang tidak dibuat handler pip.

**Perbaikan:** resolusi manager/interpreter tunggal; tampilkan command, environment target, dan target versi aktual. Bedakan update compatible dengan major upgrade. Klaim backup harus mengikuti hasil backup nyata; beberapa handler saat ini menelan error copy backup. Progress operasi panjang perlu terlihat dan hasil sukses tidak langsung dihapus oleh refresh.

Sumber: `electron/handlers/repoHandlers.ts:351-358,366-385,419-451`; `electron/handlers/dependencyHandlers.ts:149-160,185-199,223-233`; `src/components/ProjectDetail/DependenciesTab.tsx:45-75,297-299,345-353`.

### PD-13 — Analytics stale dan recovery error tidak tersedia

**Bukti: Diagnostik + review kode.** Error project A tetap tampil sesudah B berhasil dimuat. Fetch hanya bergantung pada project ID; membuka tab setelah run selesai tidak otomatis memuat ulang. Error view tidak menyediakan retry dan hasil clear tidak diperiksa.

**Perbaikan:** refresh saat tab aktif/run berubah, hapus error setelah recovery, per-project request guard, serta Retry/Refresh dan last-updated. Label Total runs/uptime perlu menjelaskan retention: statistik dihitung dari run selesai yang masih disimpan, dibatasi 200 run, bukan lifetime. Grafik sebaiknya memiliki skala/nilai yang dapat dibaca tanpa hover.

Sumber: `src/components/ProjectDetail/AnalyticsTab.tsx:100-134,140-187`; `electron/managers/HealthManager.ts:82-93,130-143`.

### PD-14 — Log filtering, live tail, dan empty state belum lengkap

**Bukti: Diagnostik + review kode.** Log berlevel `warning` lolos filter warn, tetapi hilang saat digabung dengan search yang cocok karena pemeriksaan level kedua memakai equality berbeda. Laravel logs hanya reload manual; daftar file tidak memiliki refresh UI untuk file log baru. Tail backend membaca seluruh file ke memori sebelum memotong baris. Konten kosong dipecah menjadi `['']`, sehingga empty-state pesan log dapat terlewati.

**Perbaikan:** normalisasi level sekali, live tail yang dapat dipause, refresh file list/rotation, pembacaan tail berbatas byte, virtualisasi Laravel logs, dan group stack trace. Tambahkan filter sumber command serta copy/export hasil filter.

Sumber: `src/components/ProjectDetail/LogsTab.tsx:82-89`; `src/components/ProjectDetail/LaravelLogsTab.tsx:78-110,129-133,195-204`; `electron/handlers/projectHandlers.ts:395-419`.

### PD-15 — Env profile terlihat disabled tetapi tetap dapat diklik

**Bukti: Runtime + diagnostik.** Chip `.env.production` yang tidak ada hanya diberi styling disabled; klik tetap memanggil read file yang tidak ada. Reload file list juga tidak membaca ulang isi file yang sama. Mode Edit memperlihatkan semua nilai walau Reveal secrets tidak dicentang; label tersebut tidak menjelaskan batas read mode.

**Perbaikan:** disabled fungsional atau CTA Create yang jelas, pisahkan reload daftar dan reload isi, serta label File/Profile yang tidak mengesankan aktivasi environment saat launch. Buat status visibilitas nilai sesuai mode editor.

Sumber: `src/components/ProjectDetail/EnvironmentTab.tsx:84-107,181-199,243-248`.

### PD-16 — Tab tersembunyi tetap melakukan pekerjaan awal

**Bukti: Review kode.** Git, Scripts, Dependencies, Environment, Analytics, dan pembaca Laravel log dipasang dengan CSS hidden. Membuka App memulai request seluruh panel, termasuk scan dependency yang dapat mengakses registry. Memasuki fullscreen meng-unmount sebagian panel dan keluar fullscreen memulai request lagi.

**Perbaikan:** lazy initial load per tab, cache per project, refresh saat relevan, deduplikasi request, dan pisahkan lifetime pekerjaan dari lifetime UI. Pertahankan kontrak persistensi PTY/preview yang sudah ada. Dampak latency/CPU belum dibenchmark.

Sumber: `src/components/ProjectDetail/ProjectDetailView.tsx:169-239`; `src/components/ProjectDetail/DependenciesTab.tsx:199-270`.

### PD-17 — Aksesibilitas dan lokalisasi parsial

**Bukti: Runtime + review kode.** Mengubah bahasa ke Indonesia menerjemahkan sidebar, tetapi mayoritas Project Detail tetap berbahasa Inggris. Tab mempunyai role tablist/tab namun belum memiliki Arrow/Home/End, roving tabindex, relasi tabpanel, atau pengelolaan fokus. Path header berupa paragraf clickable. Sejumlah input hanya mempunyai placeholder dan banyak notifikasi belum menggunakan live region.

**Perbaikan:** gunakan i18n untuk seluruh label/state; tab keyboard-accessible; path sebagai button/link; label input dan fokus yang terlihat; feedback operasi melalui role status/alert. Audit kontras aktual diperlukan terutama untuk teks kecil muted; audit ini belum mengukur rasio kontras menyeluruh.

Sumber: `src/components/ProjectDetail/TabNavigation.tsx`; `src/components/ProjectDetail/ProjectDetailHeader.tsx:101-107`; mayoritas komponen Project Detail dibanding `PreviewDeviceBar.tsx` yang sudah memakai i18n.

## 4. Rekomendasi UI/UX menyeluruh

1. **Header compact dan sticky secara selektif.** Pada screenshot 1024×600, isi panel baru dimulai sekitar y=371. Ringkas metadata dan jarak vertikal; tampilkan detail tambahan melalui expand. Di Environment, ringkasan launcher kosong menghabiskan ruang sebelum editor file yang paling berguna.
2. **Batasi scroll horizontal pada strip tab.** Seluruh halaman tidak perlu melebar. Tab aktif otomatis terlihat; underline mengikuti resize dan perubahan framework.
3. **Perjelas tiga jenis keluaran.** Shell interaktif, output proses/task, dan application log Laravel berbeda. Gunakan label/panel sumber yang konsisten, bukan membuat pengguna menebak antara Terminal dan Logs.
4. **Hubungkan aksi dengan hasil.** Setelah Run/Install, sediakan Open output yang menuju run terkait. Crash banner menyediakan View logs dan Ask Agent dengan konteks error. Saat update, tampilkan progress dan hasil aktual.
5. **Panel kerja dapat di-resize.** Tinggi shell 320 px dan output 288 px tetap memaksa scroll vertikal bertumpuk. Split pane atau toggle Shell/Output lebih sesuai jendela pendek.
6. **State UI seragam.** Loading, empty, unsupported, failed, retry, pending, dan completed berbeda secara semantik. Terapkan pola ini ke seluruh tab.
7. **Settings mencerminkan konfigurasi efektif.** Tampilkan preview host, proses tambahan, dependency antarproject, tags, dan custom commands; saat ini ringkasan read-only hanya menampilkan enam field utama. Pisahkan konfigurasi tersimpan dari konfigurasi proses yang sedang berjalan dan jelaskan kapan restart diperlukan.
8. **Tingkatkan keterbacaan informasi sekunder.** Banyak metadata/aksi memakai 9–11 px. Prioritaskan ukuran yang mudah dibaca, target klik memadai, dan kontras terukur tanpa menambah kepadatan tombol.

## 5. Fitur tambahan yang paling bernilai

### A. Project health / readiness panel — nilai tinggi, kompleksitas menengah

Ringkasan status proses, kesiapan HTTP, port conflict, command gagal, runtime yang tidak ditemukan, dan dependency project yang belum siap. Backend sudah mempunyai sebagian sinyal; fokusnya menyatukan diagnosis dengan tindakan yang relevan. Ini memperluas readiness yang ada, bukan memulai dari nol.

Acceptance: pengguna dapat mengetahui mengapa preview belum tersedia dan menuju log/konfigurasi yang benar dalam satu aksi.

### B. Task center per project — nilai tinggi, kompleksitas menengah

Satukan custom command, package script, install, dan update sebagai task dengan run ID, progress, durasi, exit code, output terfilter, stop, dan rerun. Registry task menjadi sumber kebenaran bagi Scripts dan Terminal. Tambahkan favorite task serta dukungan Composer scripts, Make/Just, atau task Python/Go yang terdeteksi.

Acceptance: task selesai otomatis mengganti Stop menjadi Rerun, state tetap benar ketika project/tab berganti, dan setiap output dapat ditelusuri ke run tertentu.

### C. Split preview + output / Agent — nilai tinggi, kompleksitas menengah–besar

Preview berdampingan dengan output proses atau Agent, dengan divider yang dapat di-resize. Add action Send error to Agent dari log terpilih dan crash banner. Tombol Agent saat ini sudah membuka workspace project; tambahan ini membawa konteks masalah yang dipilih.

Acceptance: pengguna dapat menjalankan app, membaca error, dan meminta diagnosis tanpa kehilangan posisi preview/log.

### D. Environment workflow — nilai tinggi, kompleksitas menengah

Bandingkan `.env` dengan `.env.example`, tampilkan key kurang/duplikat, buat file dari template, lihat diff sebelum save, serta pilih backup untuk restore. Launch profile nyata dapat ditambahkan setelah aturan framework dan prioritas launcher vars/file jelas.

Acceptance: memilih file untuk diedit tidak mengubah environment launch secara implisit; profile aktif terlihat dan dapat diverifikasi pada run.

### E. Preview toolkit — nilai menengah–tinggi, kompleksitas menengah

Screenshot perangkat ke clipboard/file, bookmark route, panel browser console per project, reset session dengan feedback, dan preset ukuran user. Console warning/error sudah diteruskan ke activity feed; fitur baru menampilkannya dekat preview dengan sumber/baris dan filtering.

Acceptance: screenshot menangkap native WebContents yang benar, termasuk saat simulator aktif; skala tampilan tidak mengubah resolusi emulasi yang dipilih.

### F. Kontrol proses tambahan — nilai tinggi untuk full-stack, kompleksitas menengah–besar

Tambah/edit nama proses secara manual, restart/stop proses tertentu, filter log per service, dan pilih service utama untuk preview. UI sekarang menampilkan proses tambahan dan bisa mengedit/menghapus yang ada, tetapi tidak menyediakan Add process di modal.

Acceptance: backend/frontend/worker dapat diperiksa dan dioperasikan secara independen dengan status agregat project yang tetap jelas.

### G. Git workflow yang lebih mudah — nilai menengah, kompleksitas bertahap

Branch picker, file search, tampilan conflict eksplisit, lihat perubahan per commit, copy hash, buka file di editor, dan publish branch. Partial staging dapat menjadi tahap lanjut setelah isolasi state dan serialisasi operasi benar.

### H. Analytics yang dapat ditindaklanjuti — nilai menengah, kompleksitas menengah

Pilih rentang waktu, tampilkan peak CPU/RAM yang sudah tersedia di backend, startup duration, drill-down crash ke output run, dan export ringkasan. Bedakan statistik retention window dengan lifetime totals.

## 6. Urutan implementasi yang disarankan

### Tahap 1 — Data dan hasil operasi benar

- PD-01/02: proteksi draft/context Environment dan fokus input modal.
- PD-03/11: isolasi Git per project dan guard seluruh mutasi.
- PD-04/05/12: kontrak dependency, exit code, manager/interpreter, error state dan janji target versi.
- PD-06: registry task dan sinkronisasi selesai/gagal.

### Tahap 2 — Alur sehari-hari nyaman

- PD-07/08: tab responsive, active tab valid, zoom reset, device fit/scroll.
- PD-09/13/14/15: readiness/error/retry, analytics refresh, log search/tail, env file UX.
- PD-16/17: lazy loading/cache, keyboard, fokus, i18n.
- Header compact, Open output, serta ringkasan settings efektif.

### Tahap 3 — Tambahan fitur bernilai

Mulai dari Project health + Task center + Send error to Agent. Berikutnya split preview/output, env comparison/restore, screenshot/route bookmarks, dan kontrol multi-process. Prioritas ini berdasarkan alur penggunaan serta temuan audit, bukan data telemetry pengguna.

## 7. Regression coverage yang diperlukan saat perbaikan

- Project A/B dengan request selesai terbalik; dialog/aksi tidak salah konteks.
- Draft env/commit dan state task melewati perpindahan project, tab, dan fullscreen.
- Input nama env diketik per karakter, bukan hanya `fill()`.
- Script exit sukses/gagal, restore state, stop run usang, dan double-run.
- Output CLI riil Composer/Cargo; malformed JSON; manager hilang; jaringan gagal; exit code berbeda per command; backup gagal.
- Git untracked, branch tanpa upstream, busy keyboard, file dengan rename/karakter khusus, konflik, dan failure recovery.
- Layout 1024×600 serta 1440×900, sidebar expanded/collapsed, nama panjang, dark/light, bahasa en/id, dan keyboard-only.
- Native zoom 150→100; simulator tinggi/lebar melebihi viewport; port ditambahkan setelah mount; loadURL gagal dan retry.
- Log warning + search; file kosong; rotation; tail file besar dengan penggunaan memori terbatas.
- Analytics error→success, run selesai ketika tab tersembunyi, clear gagal, dan label retention.

Test diagnostik sementara telah diselesaikan lalu dikeluarkan dari suite aplikasi karena mengassert bug yang ada. Saat implementasi, ubah skenario tersebut menjadi regression test yang mengassert perilaku benar.

## Referensi kontrak CLI

- Composer output: <https://github.com/composer/composer/blob/main/src/Composer/Command/ShowCommand.php>
- Cargo outdated output: <https://github.com/kbknapp/cargo-outdated/blob/master/src/cargo_ops/elaborate_workspace.rs>

Source upstream di atas diperiksa saat audit; implementasi mendatang sebaiknya mem-pin fixture ke versi tool yang didukung.
