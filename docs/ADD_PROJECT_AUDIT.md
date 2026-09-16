# Audit Add Project — flow, UI/UX, kode, dan improvement

Tanggal: 16 September 2026

Baseline: `664a99d` — `fix(project-detail): resolve state, tooling and preview issues`

## Status setelah perbaikan

**Perbaikan untuk AP-01–AP-18 telah diterapkan.** Browse, drop, dan analisis path manual memakai controller sesi yang sama; draft manual aman dari respons terlambat; path disimpan secara canonical; validasi inline, konfigurasi detector, dependency readiness, dan aksi setelah save diperbaiki.

- Full unit/integration: **981 test lulus**, termasuk **27 regression Add Project** (12 renderer + 15 backend). Patch metadata error terakhir juga diverifikasi dengan **31 test terkait lulus**.
- **19 skenario E2E unik terkait lulus**: Add Project 3, lifecycle/settings 2, Laravel 2, Project Detail 1, Agent 7, env editor 1, native preview 3.
- Typecheck, build main/preload/renderer, dan `git diff --check` lulus. Lint: **0 error, 7 warning** (enam batas panjang file dan satu unused import pada test Dashboard).
- Detail implementasi dan batas verifikasi ada di bagian 7.

Bagian 1–3 mempertahankan **bukti historis baseline `664a99d`**, termasuk nomor baris saat audit; deskripsi bug di sana bukan kondisi aplikasi terbaru. Bagian 4–5 adalah rekomendasi awal: fitur roadmap dan semua usulan refactor bukan otomatis bagian dari perbaikan AP. Probe characterization telah dipromosikan menjadi regression dengan ekspektasi perilaku benar di suite normal; direktori `docs/audits/add-project/` kini hanya menyimpan config shortcut.

### Yang sudah baik pada baseline

- Browse-first mudah dipahami; hasil menampilkan framework, command, package manager, dan port sebelum disimpan.
- Advanced Settings memakai progressive disclosure; header dan footer tetap terlihat ketika isi form digulir.
- Save dan Browse saat deteksi mempunyai disabled state. Request ID melindungi respons deteksi lama yang dipicu di dalam modal.
- Backend memvalidasi direktori, skema, nama duplikat, dan path duplikat dasar; penyimpanan memakai antrean mutasi dan atomic write.
- Detector mengutamakan Laravel sebelum framework JS, memahami Composer dev script, serta hanya menambahkan proses assets pada Laravel yang benar-benar terhubung ke frontend.
- Metadata secret disembunyikan ketika data proyek dikirim kembali ke renderer. Baris environment menggunakan identitas editor stabil.
- Happy path tambah → start → log → stop dan persistensi konfigurasi tetap lulus.

## 1. Alur baseline sebelum perbaikan

### Masuk

- Sidebar, halaman Projects, empty state Dashboard, command palette, dan `Ctrl/Cmd+N` membuka modal project.
- `App.tsx:116–131` mengatur `openModal`, `editingProject`, dan reset `droppedProject` saat tutup.
- `AppModals.tsx:77–84` memasang `ProjectModal` secara permanen; `isOpen` mengatur isi dialog.
- Drag/drop menuju `MainLayout.tsx:84–107` → `useAppDrop.ts:36–58`. Duplicate juga memakai `droppedProject`, tetapi berasal dari konfigurasi proyek existing.

### Pilih dan deteksi

- Modal kosong hanya menawarkan Browse.
- `ProjectModal.tsx:191–201` memanggil folder picker, lalu `analyzeFolder`.
- `ProjectDetector.ts:104–190` memeriksa direktori, metadata, framework, package manager, command, port, dan warnings.
- Ringkasan muncul; field manual berada dalam Advanced Settings. CUSTOM/no command membuka konfigurasi otomatis setelah deteksi sukses.

### Validasi dan simpan

- `validateProjectForm` memeriksa name/path/start command, rentang port, dan command tambahan.
- `handleSubmit` flush tag, mengubah port ke number/null, lalu memanggil `onSave`.
- `useAppProjectActions.ts:314–330` → `useProjects.addProject` → IPC `add-project`.
- `projectHandlers.ts:97–125` melakukan sanitasi, normalisasi, validasi, pemeriksaan direktori/duplikat, dan update storage.
- Backend mengirim `projects-updated`; frontend juga menerima hasil save. Modal ditutup dan toast sukses muncul. Tampilan tidak diarahkan ke proyek baru.

## 2. Bukti dan cakupan audit baseline

**Runtime** berarti Electron nyata dengan data fixture terisolasi. **Diagnostik** berarti probe komponen/hook/backend dengan input terkontrol. **Review** berarti disimpulkan dari kode, bukan diklaim sebagai pengujian end-to-end.

- **74 test existing relevan lulus di 5 file**: ProjectModal 10, ProjectDetector 18, projectSchemaV3 21, projectHandlers 19, useProjects 6.
- **19 probe diagnostik lulus di 2 file**: 11 renderer dan 8 backend. Lulus berarti perilaku baseline yang bermasalah berhasil direproduksi, bukan bug sudah diperbaiki.
- **4 E2E existing lulus**: lifecycle proyek, persistensi settings, serta dua variasi Laravel/Vite.
- **3 probe runtime lulus**: English/dark 1440×900, Indonesia/light 1024×600, serta File API/path relatif/command panjang. Total 7 skenario runtime unik berhasil, dengan probe runtime dijalankan ulang setelah penyesuaian harness.
- Saat validasi konfigurasi probe, penggabungan awal config juga menjalankan suite aplikasi penuh: **972 test lulus / 104 file**, yaitu 953 existing + 19 probe. Config probe kemudian dibatasi menjadi dua file; 19 probe lulus kembali.
- ESLint untuk seluruh file harness audit lulus.
- Folder picker OS dilewati melalui hook `DEVLAUNCHER_TEST_FOLDER`. Interaksi Explorer drag-folder native, instalasi dependency nyata, dan semua OS belum diverifikasi.
- Runtime memakai build main/preload yang tersedia dari verifikasi baseline sebelumnya; source aplikasi tidak berubah selama audit.

### Pengukuran UI

- Modal Advanced pada 1440×900: area isi terlihat **618 px**, isi total **916 px**.
- Modal Advanced pada 1024×600: area isi terlihat **363 px**, isi total **916 px**, bahkan sebelum menambahkan banyak env/custom commands.
- Halaman tidak overflow horizontal pada konfigurasi standar di dua ukuran tersebut.
- Command dengan token panjang: lebar konten **3.923 px** dalam area **436 px**; ringkasan memotong teks tanpa affordance baca penuh.
- Fokus awal berada pada tombol Close. Accessible name dialog adalah `projectModal`.

Screenshot baseline sebelumnya berada di `test-results/runtime.probe-*`. Playwright membersihkan direktori ini ketika dijalankan ulang. Regression terbaru menghasilkan screenshot `01-empty.png` sampai `05-long-command.png` di `test-results/add.project.regressions-*`; artefak diabaikan Git dan dapat dibuat ulang dengan command di bagian 6.

## 3. Temuan baseline berprioritas

P1 = prioritaskan sebelum memperluas onboarding; P2 = perbaikan penggunaan sehari-hari dan konsistensi.

### AP-01 · P1 — Deteksi ulang menimpa input manual

**Bukti: diagnostik.** `ProjectModal.tsx:133–180`.

1. Browse Node → Advanced → Change folder dengan respons tertunda.
2. Ubah nama dan tambah baris environment sebelum deteksi selesai.
3. Saat hasil Go masuk, nama berubah ke nama detector dan baris environment hilang.

`analyzeFolder` menyalin `formData` dari closure sebelum `await`, lalu `setFormData(next)` mengganti seluruh draft. Guard request ID menjaga urutan request, bukan perubahan field selama request. Selain itu, `lastDetected` diisi dengan hasil merge termasuk nilai manual: nama manual bertahan pada satu re-detect, tetapi terklasifikasi sebagai nilai detector dan tertimpa pada re-detect berikutnya.

**Perbaikan:** reducer/session state dengan field provenance (`default`, `detected`, `user`); merge hasil ke state terbaru; catat hanya nilai yang benar-benar ditulis detector. Acceptance: edit selama deteksi dan beberapa re-detect berturut-turut tetap mempertahankan field manual.

### AP-02 · P1 — Nilai kosong dari folder baru tidak membersihkan konfigurasi lama

**Bukti: diagnostik + review.** `ProjectModal.tsx:133–138, 160–179`; `electron/projectSchema.ts:104–108`.

Node port 3000 → Change folder ke Go dengan `defaultPort:null` tetap mengirim **port 3000** saat Save. `applyDetection` menolak `null`/string kosong sebelum mengecek apakah field masih otomatis. Normalisasi backend menyalin top-level port ke primary command, sehingga command Go yang semula null ikut dipantau pada 3000.

Pola yang sama membuat start command lama berpotensi bertahan ketika folder baru tidak memiliki command. Dampaknya: startup menunggu port yang salah atau menjalankan command yang tidak sesuai folder.

**Perbaikan:** bedakan “tidak ada hasil” dengan “nilai kosong yang valid”; reset field milik detector ketika folder berubah. Portless harus tetap null sampai user secara eksplisit memasukkan port.

### AP-03 · P2 — Jalur manual tidak tersedia ketika deteksi pertama gagal

**Bukti: diagnostik.** `ProjectModal.tsx:150–152, 194, 236–237, 253–264, 317–324`.

Ketika detector mengembalikan error, path belum disimpan ke form. Yang tersisa hanya Browse dan pesan error; input path, Advanced Settings, dan Add tidak tersedia. Pengguna tidak bisa paste path atau melanjutkan konfigurasi manual dari kondisi ini.

**Perbaikan:** selalu sediakan “Masukkan path”/“Konfigurasi manual”; simpan folder terpilih sebelum analisis; pisahkan validitas direktori dari kemampuan detector. Error harus memiliki Retry dan jalur manual yang jelas.

### AP-04 · P1 — Drop mempunyai race tersendiri dan kehilangan metadata deteksi

**Bukti: diagnostik + review.** `useAppDrop.ts:36–58`; `ProjectModal.tsx:52–104, 292, 315`.

- Drop A → drop B → B selesai → A selesai: hasil akhir menjadi A.
- Menutup modal saat drop masih dianalisis tidak membatalkan hasil; respons terlambat mengisi `droppedProject` lagi. Add berikutnya dapat terbuka dengan folder lama.
- Modal dibuka sebelum deteksi selesai tanpa state loading dari drop. Hasil drop membuang `packageManager` dan `warnings`; summary memakai `detection:null`, sehingga package manager ditampilkan “Not required”.
- Drop selalu membuka Advanced, berbeda dari Browse pada proyek identik.

**Perbaikan:** satu controller `selectFolder(path)` untuk Browse/drop/manual; request dan session ID sama, state loading/error sama, metadata hasil utuh; reset/invalidate pada close.

### AP-05 · P2 — Duplicate masuk ke flow yang pasti ditolak jika path tidak diganti

**Bukti: diagnostik + runtime duplikat path + review.** `useAppDrop.ts:60–79`; `projectHandlers.ts:115–117`.

Duplicate menyalin path existing, sedangkan backend melarang dua project pada path yang sama. Nama “(copy)” saja tidak cukup; kegagalan baru terlihat setelah Save. Secret yang sudah di-redact juga disalin menjadi value kosong tanpa metadata, sehingga form tidak menjelaskan bahwa nilai perlu diisi ulang.

**Perbaikan:** tetapkan kontrak fitur. Jika Duplicate berarti menyalin konfigurasi ke folder lain, minta folder tujuan terlebih dahulu dan tandai secret yang perlu diisi ulang. Jika tujuan sebenarnya launch profile, gunakan model profile yang eksplisit.

### AP-06 · P2 — Validasi field belum selaras dengan backend; error sulit dipulihkan

**Bukti: diagnostik dan runtime.** `projectFormData.ts:48–74`; `ProjectModal.tsx:203–233, 406, 412, 429`; `electron/projectSchema.ts:190–198, 253–259`.

Frontend menerima `BAD KEY`, key env duplikat, dan custom command kosong. Backend menolak setelah round-trip. Pada runtime, error env hanya muncul di footer dan toast, tanpa penanda pada baris. Mengganti `BAD KEY` menjadi `GOOD_KEY` tidak membersihkan error footer; pesan lama bertahan sampai submit berikutnya. Blank env key juga bisa dibuang normalizer sebelum validasi, sehingga row tidak tersimpan tanpa penjelasan.

**Perbaikan:** validasi shared schema/aturan field, error per row ber-ID stabil, fokus dan scroll ke error pertama, `aria-invalid`/`aria-describedby`, hapus error terkait saat diedit. Pertahankan validasi backend sebagai otoritas save.

### AP-07 · P1 — Escape pada pemilih tipe menutup seluruh draft

**Bukti: diagnostik dan runtime keyboard.** `DropdownMenu.tsx:34–48, 78–82`; `AnimatedModal.tsx:52–65, 80`.

Buka Advanced → buka dropdown tipe → Escape: modal Add tertutup dan saat dibuka kembali draft kosong. Handler Escape modal berjalan pada ancestor panel dan menghentikan event sebelum listener dropdown pada document. Dialog juga bernama `projectModal`, bukan judul “Tambah Proyek”. Fokus awal Close, bukan Browse.

**Perbaikan:** Escape ditangani komponen teratas; tutup dropdown dahulu dan kembalikan fokus ke trigger. Hubungkan dialog ke heading. Letakkan fokus awal pada tugas utama dan dukung keyboard navigasi menu.

### AP-08 · P1 — Deteksi port tidak terikat ke command yang dipilih

**Bukti: diagnostik + review lifecycle.** `ProjectDetector.ts:93–99, 231–237, 376–406`; `processHandlers.ts:22–34`; `ProcessManager.ts:100–104`; `processPortBase.ts:34–44`.

- Manifest `{ preview: 'vite preview --port 4999', dev: 'vite --port 5173' }` menghasilkan `npm run dev` dengan port **4999**: port diambil dari script pertama yang cocok, bukan script terpilih.
- Node worker `node worker.js` diberi default web port **3000** tanpa bukti listener.
- `.env` dibaca sebelum `.env.local` dan CLI; regex port pertama dalam Vite config tidak membedakan `server` dan `preview`.
- Launch dapat menambahkan flag port ke script npm/pnpm/yarn/bun; inferensi yang keliru berpotensi mengubah command efektif. Proses non-web dengan port salah dapat berakhir readiness timeout (Node default 60 detik; Go 120 detik).

**Perbaikan:** inferensi berdasarkan selected script dan framework; tampilkan sumber/confidence port; mode eksplisit “web server” atau “worker/CLI”. Pisahkan monitored port, preview URL, dan kebijakan penyisipan flag command.

### AP-09 · P2 — Package manager berbeda antara Add dan panel dependency

**Bukti: diagnostik.** `ProjectDetector.ts:211–228`; `electron/utils/projectTooling.ts:7–15`.

Folder tanpa `packageManager` dengan `pnpm-lock.yaml` dan `package-lock.json`: Add memilih **pnpm**, tooling memilih **npm**. Kedua resolver punya daftar/prioritas sendiri; handling manager tidak dikenal dan normalisasi casing juga berbeda.

**Perbaikan:** satu resolver bersama, hasil menyertakan sumber dan konflik lockfile. Jika metadata ambigu, tawarkan pilihan dan gunakan hasil konsisten untuk start/scripts/install/update.

### AP-10 · P2 — Inferensi Python terlalu optimistis

**Bukti: diagnostik + review.** `ProjectDetector.ts:80–90`; `electron/utils/projectDetection.ts:51–62`; `ProcessManager.ts:134`.

`pyproject.toml` tanpa entrypoint tetap menghasilkan `python main.py`, warnings kosong meski file tidak ada. Folder berisi hanya `manage.py` tidak masuk detector Python. File `app.py` diasumsikan memakai port 5000. Startup menggunakan `python` dari inherited PATH, sementara tooling pip sekarang memilih virtualenv lokal.

**Perbaikan:** periksa entrypoint aktual, `manage.py`, framework/runner, dan virtualenv; bila bukti tidak cukup, minta command daripada memberikan konfigurasi seolah siap. Gunakan interpreter/runner terpilih konsisten pada launch dan dependency tooling.

### AP-11 · P2 — Error manifest disembunyikan sebagai metadata tidak ditemukan

**Bukti: diagnostik.** `ProjectDetector.ts:193–197, 425–435`.

`package.json` valid dengan UTF-8 BOM dibaca sebagai null: React/Vite berubah menjadi Node.js, command kosong, package manager null. Catch generik menyamakan missing file dengan parse error/unreadable file; warning hanya meminta command, bukan menjelaskan manifest bermasalah.

**Perbaikan:** baca tiap manifest sekali, tangani BOM, bedakan missing/parse/unreadable, validasi bentuk JSON, kirim diagnostics dengan lokasi file dan tindakan perbaikan.

### AP-12 · P1 — Path relatif melewati pemeriksaan duplikat

**Bukti: diagnostik dan IPC runtime.** `electron/utils/pathKey.ts:15–18`; `projectSchema.ts:121`; `projectHandlers.ts:109–119`.

Menambahkan direktori yang sama sebagai path absolut dan `test-results\fixtures\...` dengan nama berbeda menghasilkan **dua save sukses**. `path.normalize` bukan `path.resolve`/canonical identity; backend menerima dan menyimpan path relatif. Input path Advanced memungkinkan ini tanpa mengubah aplikasi.

**Perbaikan:** canonicalize path absolut pada boundary save dan comparison; tetapkan kebijakan symlink/junction serta filesystem casing; kembalikan existing project ID pada konflik. Relative-path bypass telah diuji; alias symlink belum diuji runtime.

### AP-13 · P2 — Edit path manual tidak menginvalidasi summary lama

**Bukti: diagnostik.** `ProjectModal.tsx:115–128, 277–300, 334`.

Mengganti path di Advanced tidak memicu deteksi atau menghapus status “Detected as Node.js”. Save memakai path baru dengan nama, command, dan metadata folder lama. UI tidak menunjukkan bahwa deteksi sudah kedaluwarsa.

**Perbaikan:** simpan `analyzedPath`, invalidasi summary pada perubahan path, tawarkan Analyze ulang; jelaskan field manual yang dipertahankan.

### AP-14 · P1 — Respons save lama dapat menutup sesi modal baru

**Bukti: diagnostik hook + review UI.** `ProjectModal.tsx:210–233, 249, 430–433`; `useAppProjectActions.ts:314–330`; `App.tsx:126–131`.

Saat Save pending, Cancel/Close/Escape tetap tersedia. Jika user menutup lalu membuka Add lain, hasil save pertama memanggil `closeModal()` global dan menutup form baru. Field juga tetap editable saat saving meskipun payload sudah diambil; edit berikutnya dapat hilang saat close.

**Perbaikan:** scope save completion ke modal session ID; tetapkan interaksi saving yang jelas. Jika close tetap diizinkan, simpan operasi di background dan jangan mengubah sesi baru. Cegah edit yang tidak akan ikut payload atau jelaskan snapshot yang sedang disimpan.

### AP-15 · P2 — Depends on mengurutkan spawn, belum menunggu ready

**Bukti: diagnostik handler + review.** `ProjectModal.tsx:413–422`; `processHandlers.ts:150–187`; `ProcessManager.ts:152–158`.

Dependency berstatus `starting` langsung dilewati, lalu aplikasi utama dijalankan. `startProcess` menyelesaikan promise setelah spawn; readiness diproses kemudian. Untuk API yang membutuhkan DB siap menerima koneksi, “These projects will start before this one” belum memastikan kebutuhan tersebut.

**Perbaikan:** jelaskan semantics spawn order atau tambahkan wait-for-ready dengan timeout dan feedback dependency. Validasi referensi/cycle saat save untuk konfigurasi hasil edit/import. Probe menguji orchestration, bukan startup database nyata.

### AP-16 · P1 — Jalur drag/drop memakai File API yang tidak tersedia

**Bukti: API runtime dan review integrasi.** `MainLayout.tsx:92–99`; `electron/preload.ts`.

Handler membaca `e.dataTransfer.files[0].path`. File backed by disk yang dimasukkan lewat input file Electron menghasilkan **`typeof file.path === 'undefined'`**. Event drop diagnostik melewati handler tanpa `preventDefault`, dan preload belum menyediakan pengganti `webUtils.getPathForFile`.

**Perbaikan:** expose wrapper `webUtils.getPathForFile` dari preload, konsumsi di renderer, validasi direktori, tampilkan state drag-over/drop error, dan jelaskan penanganan multi-folder. Browse dan drop harus bermuara pada controller yang sama. Drag Explorer folder native masih perlu smoke test setelah perbaikan.

### AP-17 · P2 — Form advanced terlalu panjang dan feedback menutupi aksi

**Bukti: screenshot, DOM measurement, runtime.** `ProjectModal.tsx:241–252, 266–324, 428–435`; `ToastContainer.tsx:92`.

- Pada 1024×600, summary + header Advanced memakai hampir seluruh 363 px area isi; hanya name field mulai terlihat. Mengedit command/port membutuhkan scroll melewati summary yang mengulang informasi.
- Error panjang berbagi baris footer dengan Cancel/Add; pada error duplikat path, label tombol membungkus dan ruang aksi menyusut.
- Toast bottom-right `z-[60]` berada di atas modal `z-50`; error toast menutupi sebagian tombol Add. Beberapa percobaan save membuat tumpukan error dan success menutupi area kanan form.
- Path ringkasan selalu terpotong tanpa tooltip/copy; command panjang terpotong oleh container overflow-hidden.

**Perbaikan:** ringkas folder summary saat advanced terbuka; taruh name/command/port sebagai field dasar; group advanced menjadi proses, env, organisasi. Letakkan form error pada baris tersendiri; pertahankan tombol `shrink-0`/nowrap; hindari toast duplikat untuk error modal. Sediakan baca/copy path dan wrapping atau scroll lokal untuk command.

### AP-18 · P2 — Bahasa, semantics kontrol, dan langkah setelah sukses belum konsisten

**Bukti: runtime + review.** `ProjectModal.tsx:315, 318–320, 341–359, 368–385, 398–402, 418`; `useAppProjectActions.ts:319–328`; `ToastContainer.tsx:55–76`; `dashboardWidgets.tsx:371`.

Pada UI Indonesia, error dan toast sukses tetap Inggris. Label Additional process/remove/placeholder belum seluruhnya dilokalkan. Advanced tidak mempunyai `aria-expanded`/`aria-controls`; host/dependency/tag selection hanya dibedakan warna, bukan state aksesibel. Form tidak memakai native submit, error tidak memindahkan fokus, dan toast tidak mempunyai live-region semantics. Setelah Add, hanya ada toast; user tetap di halaman sebelumnya tanpa aksi langsung membuka/menjalankan proyek baru.

**Perbaikan:** structured error code → terjemahan lokal, heading/label/control relationship, radio atau `aria-pressed` untuk pilihan, form submit dan fokus error. Setelah sukses tawarkan “Buka proyek” serta “Jalankan” secara jelas dengan status tersimpan yang berbeda dari readiness runtime.

## 4. Usulan flow yang lebih ringkas

### A. Pilih folder

- Browse, drop, dan paste path terlihat sejak awal.
- Langsung tampilkan path terpilih serta status “Menganalisis…”.
- Deteksi duplikat lebih awal; jika sudah terdaftar tampilkan nama proyek dan tombol Buka.
- Deteksi gagal tetap membuka jalur manual, dengan alasan dan Retry.

### B. Tinjau konfigurasi dasar

- Nama, command utama, tipe, dan port bisa diedit langsung tanpa membuka semua opsi.
- Setiap hasil otomatis punya asal yang ringkas: misalnya `package.json → scripts.dev`, `vite.config.ts → server.port`, atau “perkiraan framework”.
- Port opsional disertai pilihan web server vs worker/CLI. “Tidak perlu”, “Tidak ditemukan”, dan “Gagal dibaca” merupakan state yang berbeda.
- Bila beberapa script/entrypoint cocok, beri pilihan; jangan memaksakan salah satu seolah pasti benar.

### C. Opsi lanjutan sesuai kebutuhan

- Proses tambahan: add/remove/reorder, primary process yang jelas, port per proses, command vs custom one-off task dibedakan.
- Environment: aturan key langsung, duplicate detection, penjelasan override saat launch dan perbedaannya dengan file `.env`.
- Organisasi: tags, auto-start, dan depends-on searchable ketika proyek banyak.
- Summary folder compact; footer tetap stabil; error tampil dekat field dan tidak berkompetisi dengan CTA.

### D. Simpan dan lanjutkan

- Save yang scoped ke sesi, hasil gagal mempertahankan draft dan fokus ke masalah.
- Sukses menampilkan proyek yang disimpan dan aksi Buka/Jalankan.
- Readiness toolchain/dependency dapat menjadi pemeriksaan opsional: binary tersedia, interpreter/manager sesuai, dependencies terpasang, port in-use. Pisahkan hasil pemeriksaan dari janji aplikasi pasti berjalan.

## 5. Improvement struktur kode dan urutan implementasi

### Tahap 1 — Ketepatan state dan identitas

AP-01/02/04/12/13/14/16: session-aware form controller, satu jalur pemilihan folder, canonical project path, field provenance, latest-state merge, serta bridge drop Electron yang benar.

Pada baseline, `ProjectModal` mempunyai 442 baris, menggabungkan orchestration, heuristik merge, validation, payload conversion, dan rendering. Rekomendasi awal: ekstrak `useProjectForm`/reducer dan controller folder, lalu komponen FolderSummary, BasicConfiguration, dan AdvancedSections. Baseline `ProjectModal` juga memanggil seluruh `useProjects()` hanya untuk dua helper stateless, sehingga membuat fetch projects dan subscription tambahan bahkan saat modal tertutup; gunakan domain functions/controller yang lebih kecil.

### Tahap 2 — Kontrak detector dan launch

AP-08/09/10/11/15: resolver tooling bersama, hasil deteksi bertipe `success/error` yang tegas, parser metadata sekali per scan, selected-script-aware port, diagnostic code, confidence/source, interpreter lokal, dan dependency readiness.

Selaraskan sumber metadata tipe yang kini terpisah di `ProjectDetector`, `projectFormData`, `projectSchema`, dan `typeLabels`. Pastikan penambahan framework tidak perlu sinkronisasi manual di banyak tempat. Hindari menduplikasi logika command utama pada top-level `startCommand/port` dan array `commands`; dokumentasikan satu sumber kebenaran serta adapter kompatibilitas schema.

### Tahap 3 — Kecepatan penggunaan dan aksesibilitas

AP-03/05/06/07/17/18: entry manual, duplicate contract, validasi inline, keyboard/fokus, layout compact, i18n, dan next action setelah sukses.

### Tahap 4 — Fitur bernilai setelah fondasi stabil

- Monorepo/workspace discovery dengan kandidat subproject dan pilihan script.
- Template konfigurasi yang bisa diterapkan ke folder berbeda; launch profiles bila satu repo memang membutuhkan beberapa mode.
- Preflight ringan untuk toolchain, dependencies, port, dan entrypoint dengan langkah perbaikan yang bisa dijalankan user.
- Bulk-add dengan hasil per folder dan preview konfigurasi sebelum save.

### Acceptance regression minimum

- Input manual selama request, tiga kali re-detect, dan pergantian Node → Go → CUSTOM.
- Browse/drop lambat → close → reopen; drop A/B selesai terbalik; save A selesai ketika form B terbuka.
- Direktori sama lewat absolute/relative/case/trailing separator; folder sudah terdaftar memberi navigasi ke existing project.
- Mixed lockfiles, selected dev vs preview script port, worker tanpa port, malformed/BOM manifest, Python library tanpa entrypoint.
- Invalid/duplicate env key, custom command kosong, error server setelah field diperbaiki, repeat save.
- Escape dropdown hanya menutup dropdown; initial focus ke Browse; keyboard submit/focus error; accessible selected states.
- Light/dark, ID/EN, 1024×600, path/command/error panjang, banyak env/dependency rows; footer selalu dapat dipakai.

## 6. Menjalankan regression

Jalankan dari root repo. Semua fixture ditempatkan di dalam repo. `tests/.runtime` sudah ada pada workspace audit; siapkan direktori itu lebih dulu pada checkout baru. Playwright membersihkan `test-results`, jadi jangan gunakan direktori tersebut sebagai TEMP unit test.

```powershell
if (Test-Path -LiteralPath "tests/.runtime") {
  $env:TEMP = "$PWD\tests\.runtime"
  $env:TMP = $env:TEMP
  $env:HOME = $env:TEMP
  $env:USERPROFILE = $env:TEMP
  npx vitest run --config docs/audits/add-project/vitest.config.mjs --maxWorkers=4
  npm run build:main
  if ($?) { npx playwright test --config docs/audits/add-project/playwright.config.cjs --reporter=line }
}
```

Config tersebut menunjuk ke **regression perilaku yang benar**, bukan characterization bug:

- `src/components/Modals/__tests__/addProject.regressions.test.jsx`
- `electron/managers/__tests__/addProject.regressions.test.js`
- `e2e/add.project.regressions.spec.js`

Verifikasi penuh unit serta E2E terkait, setelah environment fixture di atas disetel:

```powershell
npm run typecheck
npm run lint
npx vitest run --maxWorkers=4 --reporter=json --outputFile=tests/.runtime/add-full.json
npm run build:main
npx playwright test e2e/add.project.regressions.spec.js e2e/app.flows.spec.js e2e/laravel.detection.spec.js e2e/project.detail.regressions.spec.js e2e/agent.spec.js e2e/preview.device.spec.js e2e/preview.fullscreen.spec.js e2e/preview.persistence.spec.js e2e/env.editor.spec.js --reporter=line
git -c core.safecrlf=false diff --check
```

`npm run build:main` membangun aplikasi Electron dan renderer; command ini tidak membuat atau menguji installer.

## 7. Hasil implementasi AP-01–AP-18

### State form, pemilihan folder, dan penyimpanan

- **AP-01:** `useProjectForm.ts` menyimpan draft terbaru dan field yang disentuh user. Hasil deteksi di-merge setelah await ke draft terbaru, sehingga edit selama request dan beberapa re-detect tidak hilang. Sinkronisasi command/port utama tidak menandai seluruh daftar proses sebagai manual; additional process otomatis tetap bisa diganti ketika folder berubah. Daftar yang diedit langsung dipertahankan sebagai manual.
- **AP-02:** port `null`, command kosong, dan daftar command kosong merupakan hasil sah untuk mengganti nilai otomatis lama. Top-level `startCommand`/`port` menjadi sumber editor untuk primary command, lalu disinkronkan ke array saat merge/edit dan dinormalisasi backend saat save.
- **AP-03:** path, Browse, name, type, command, dan port selalu tersedia. Folder disimpan sebelum analisis. Error deteksi mempertahankan path dan draft, menawarkan retry melalui Analyze folder dan konfigurasi manual.
- **AP-04:** Browse, Analyze, dan drop masuk ke controller yang sama. Request ID dan modal session ID menolak respons drop/picker/detector lama, termasuk sesudah close/reopen. Package manager, warnings, dan sources tidak dibuang.
- **AP-05:** Duplicate berarti menyalin konfigurasi ke **folder berbeda**. Path dikosongkan; konfigurasi manual dipertahankan saat memilih tujuan. Secret redacted membawa `needsValue`, ditampilkan sebagai password, wajib diisi ulang, dan marker UI dihapus dari payload save.
- **AP-12:** `canonicalProjectPath` memakai trim, `path.resolve`, dan `fs.realpathSync.native` bila tersedia. Add/update menyimpan path absolut canonical. Comparison menggunakan aturan casing platform. Konflik nama/path memberi `fieldErrors` dan `existingProjectId`; deteksi folder terdaftar memungkinkan Open project sebelum save.
- **AP-13:** edit path menginvalidasi request/summary dan menampilkan keterangan konfigurasi manual. Nilai konfigurasi tetap terlihat dan dapat diedit; Analyze folder tersedia untuk saran baru.
- **AP-14:** save completion hanya boleh memengaruhi sesi pemiliknya. Fieldset disabled selama snapshot disimpan; double submit ditolak. Close diizinkan dan operasi lama dapat selesai tanpa menutup draft baru. Refresh object proyek dengan ID sama tidak mereset draft atau status saving.
- **AP-16:** preload menyediakan wrapper sinkron `webUtils.getPathForFile`; renderer tidak lagi membaca `File.path`. Drop dicegah dari navigasi browser, satu folder diproses tiap kali, state drag-over/error dilokalkan, dan input non-direktori ditolak dengan jalur pemulihan Browse.

### Detector, tooling, dan proses

- **AP-08:** port script hanya diambil dari script terpilih (`dev`, `start`, `serve`, `develop`), kemudian static Vite `server.port`, environment sesuai precedence, dan fallback framework. Script preview lain serta `preview.port` tidak mengambil alih dev server. Generic Node tidak memiliki default web port. Proses assets Laravel mengabaikan backend `APP_PORT`/`PORT`, memakai CLI/config assets atau `VITE_PORT` dan konvensi 5173.
  - Port form adalah port yang **dipantau** untuk readiness/preview. Flag `--port` tidak disisipkan ke generic npm/pnpm/yarn/bun scripts. Pengecualian legacy `artisan serve` masih memakai port form bila command belum menentukan flag port; UI menjelaskan pengecualian ini. Composite `composer run dev` tetap utuh.
  - Sources ditampilkan sebagai provenance/hint, bukan bukti listener pasti hidup. Environment hints diberi keterangan bahwa command harus membaca variabel tersebut. Static parsing tidak mengeksekusi konfigurasi dinamis.
- **AP-09:** `projectMetadata.ts` menjadi resolver manifest/package manager/interpreter bersama untuk detector dan tooling. Deklarasi packageManager supported didahulukan; kemudian pnpm → Yarn → Bun → npm. Lockfile lintas manager menghasilkan warning dengan saran menghapus file lama atau menentukan deklarasi. Tidak ada override manager tersimpan terpisah di form.
- **AP-10:** `manage.py` dikenali dan memakai Django runserver 8000. `app.py`/`main.py` tidak otomatis dianggap server web. Library tanpa entrypoint meminta command manual. Launch dan tooling memakai interpreter lokal `.venv`, `venv`, atau `env` bila ditemukan, dengan quoting path yang sama.
- **AP-11:** manifest cache berlaku per request, BOM ditangani, JSON harus object, dan missing dibedakan dari malformed/unreadable. Error menyebut nama manifest dan memungkinkan konfigurasi manual.
- **AP-15:** dependency graph divalidasi saat add/update; referensi hilang atau cycle juga ditolak sebelum start. IPC start/start-all/restart menunggu dependency `running`, dan `ProcessManager` menerapkan guard yang sama untuk tray, MCP, auto-start, notification restart, serta auto-restart. Concurrent requests berbagi pending start agar satu dependency tidak di-spawn dua kali.
  - Status `starting` dipoll hingga ready, error/exit menggagalkan dependent, batas tunggu 125 detik. Status `running` berarti seluruh proses mencapai kebijakan readiness ProcessManager: port yang dikonfigurasi terbuka, atau spawn untuk proses tanpa port. Ini bukan health check aplikasi/DB tingkat protokol.
  - Regression menggunakan spawn Node nyata dengan listener TCP tertunda, dua dependent concurrent, serta dependency gagal. Ini memperkuat pengujian handler dengan mocked status; belum menguji database nyata.

### Validasi dan UI

- **AP-06:** aturan env key/duplicate dibagi dengan backend. Blank/invalid env, custom command kosong, dan additional command/port tidak valid ditolak sebelum IPC. Error additional process memakai ID row; duplicate port menandai field terkait. Error inline terhubung lewat `aria-invalid`/`aria-describedby`, fokus dan scroll menuju field pertama, lalu dibersihkan ketika draft diedit. Direktori dan konflik add/update juga mengembalikan field error.
- **AP-07:** type picker native `<select>` menangani keyboard/popup; Escape saat popup terbuka mempertahankan modal. Generic dropdown mengembalikan fokus ke trigger setelah Escape, dan modal memberi kesempatan nested menu menangani event. Judul dialog terhubung ke heading; fokus awal Browse untuk Add dan name untuk Edit.
- **AP-17:** konfigurasi dasar berada di luar Advanced. Summary menjadi compact saat Advanced dibuka, path dapat disalin, command ringkasan membungkus dan input panjang dapat digulir lokal. Footer error terpisah, tombol tidak menyusut/membungkus, dan save modal tidak membuat toast error ganda. E2E memeriksa CTA hit-testing serta tidak ada horizontal page overflow pada 1024×600 dan 1440×900.
- **AP-18:** native form submit, state selected/expanded/switch yang aksesibel, terjemahan pesan utama ID/EN, live region toast, dependency search, dan keterangan env override diterapkan. Save sukses menampilkan status tersimpan dengan **Open project / Start Project / Done**. Status tersimpan tidak menyatakan proses sudah berjalan.

### Catatan verifikasi akhir

- Report full Vitest lokal: `tests/.runtime/add-full.json`, **981/981 lulus**. Dua file regression Add Project menyumbang 27 test; coverage lainnya termasuk schema, handlers, ProcessManager lifecycle, Project Detail, dan shared UI.
- E2E awal: 18/19 lulus, satu assertion DPR native preview membandingkan `2` dengan `2.0000000298023224`. Assertion kini memakai toleransi `toBeCloseTo(2, 5)`. Sesudahnya locator status preview dipersempit agar tidak bentrok dengan toast yang sekarang mempunyai live-region role. Add Project 3/3 lulus lagi; native device preview 1/1 lulus sesudah kedua correction. Dengan hasil terakhir per skenario, **19/19 skenario unik lulus**; ini bukan klaim satu run terakhir berisi 19 test semuanya.
- Report E2E lokal: `tests/.runtime/add-e2e.json`, `add-e2e-final.json`, dan `add-preview-final.json`. Screenshot `test-results` dapat hilang pada run berikutnya; report di `tests/.runtime` terpisah dari output Playwright.
- Typecheck dan build terakhir lulus. Lint terakhir 0 error/7 warning; warning berasal dari panjang file main, OmpManager, previewManager test, preload, ipcValidation, OmpSettingsCard, serta unused import pada DashboardView test.

### Batas dukungan dan verifikasi

- Runtime diverifikasi pada Windows/Electron lokal, EN dark dan ID light. Picker native OS menggunakan hook fixture. Bridge File backed by disk dan synthetic drop diverifikasi; drag folder langsung dari Explorer belum smoke-tested. Symlink/junction canonicalization memakai realpath, tetapi alias tersebut belum diuji runtime lintas OS/filesystem.
- Parser Vite/env memakai static hints dan framework conventions; tidak menginterpretasikan arbitrary JavaScript, custom env loader, seluruh script chaining, atau seluruh framework Python. Ketersediaan binary/interpreter sebenarnya, registry installs, package upgrades, dan adapter lengkap Bun/Yarn modern tidak diklaim telah diuji.
- Error umum UI memakai source-message translation dan field-error map, belum katalog kode diagnostic universal. Path, command, dan beberapa provenance/error dinamis tetap berupa metadata teknis. Metadata tipe belum disatukan lintas seluruh schema/detector/UI.
- Dependency readiness adalah pemeriksaan start-time; tidak men-stop dependents otomatis ketika dependency yang sudah running kemudian gagal. Database/protocol health checks dan cancellation UI untuk dependency wait bukan fitur dalam patch ini.
- Monorepo discovery, bulk-add, launch profiles, reorder proses, preflight toolchain menyeluruh, packaging installer, dan audit kontras menyeluruh tetap di luar cakupan perbaikan AP ini.
