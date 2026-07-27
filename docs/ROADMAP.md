# Roadmap DevLauncher

## Tujuan Akhir

DevLauncher selesai ketika developer Windows dapat memasang aplikasi, menambahkan project tepercaya, menjalankan dan menghentikannya tanpa process orphan, melihat log/status akurat, memakai integrasi desktop utama, dan memulihkan data dari failure umum. Build harus reproducible dan lolos test otomatis serta clean-machine smoke test.

Status:

- **Done**: acceptance criteria inti sudah ada.
- **Partial**: implementasi ada tetapi belum memenuhi seluruh criteria.
- **Pending**: belum dikerjakan.
- **Blocked**: bergantung task lain/asset eksternal.

## Evaluasi Roadmap Lama

Roadmap lama kuat pada visi UI dan pembagian manager, tetapi mencampur plan, progress, dan completion report. Banyak task diberi klaim selesai sebelum wiring dan test tersedia. Fase baru di bawah mempertahankan tujuan lama, menambahkan security, accessibility, migration, process-tree reliability, release gate, dan clean-machine verification.

## Phase 1: Foundation

**Status: Partial**

- [x] Electron main process dan BrowserWindow.
- [x] React + Vite renderer.
- [x] Tailwind CSS theme.
- [x] Context isolation aktif, Node integration nonaktif.
- [x] Preload bridge untuk API terpilih.
- [x] electron-builder config NSIS + portable x64.
- [ ] Tambahkan `build/icon.ico` dan `build/icon.png` valid.
- [ ] Tetapkan Node.js LTS dalam `engines` dan CI.
- [ ] Tambahkan CSP production dan development yang sesuai.
- [ ] Validasi macOS behavior atau nyatakan Windows-only secara eksplisit di package/release.

Acceptance criteria:

- `npm run dev` start/close bersih.
- `npx vite build` lulus.
- Window production memuat `dist-react/index.html`.
- Renderer tidak mendapat API Node.js selain preload allowlist.

## Phase 2: Project Management dan Persistence

**Status: Partial**

- [x] Add/list/delete project.
- [x] Update project IPC.
- [x] UUID dan timestamp.
- [x] Duplicate name/path guard.
- [x] Folder picker.
- [x] Framework detection.
- [x] Atomic write, lima backup, recovery project JSON.
- [x] Hubungkan UI edit project ke `updateProject`.
- [ ] Validasi port integer `1..65535` di renderer dan backend.
- [ ] Validasi path directory sebelum add dan sebelum start.
- [ ] Normalisasi/canonicalize path sebelum duplicate check.
- [x] Definisikan schema project tunggal dan migrasi data lama (`command/env/icon` ke `startCommand/envVars/emoji`).
- [x] Serialisasi storage writes untuk mencegah lost update/race temp file.
- [ ] Tambahkan recovery/config backup atau failure UX yang jelas.

Acceptance criteria:

- CRUD lengkap dari UI.
- Invalid payload tidak dapat merusak `projects.json`.
- Dua mutation cepat tidak kehilangan data.
- Data versi lama bermigrasi deterministik.

## Phase 3: Process Lifecycle dan Logs

**Status: Partial**

- [x] Start, stop, restart project.
- [x] Status STARTING/RUNNING/STOPPING/STOPPED/ERROR.
- [x] Process-tree termination dan force timeout.
- [x] PID dibersihkan setelah exit.
- [x] Stop all saat app quit.
- [x] Real-time stdout/stderr.
- [x] Backend log buffer 1000 entry.
- [x] Regression test dasar ProcessManager.
- [x] Satukan env model individual dan Start All.
- [ ] Tampilkan partial result Start All secara rinci.
- [ ] Batasi frontend log buffer menurut config.
- [ ] Hubungkan clear log frontend dan backend.
- [ ] Tangani exit `null`/signal tanpa false crash saat user stop.
- [ ] Tambahkan timeout/cancel untuk stuck STARTING.
- [ ] Simpan/update `lastRun` bila fitur dipakai UI.

Acceptance criteria:

- Lifecycle tetap konsisten pada success, spawn error, crash, stop, restart, dan app quit.
- Tidak ada child process orphan pada Windows.
- Memory log bounded di main dan renderer.
- Semua lifecycle path punya automated regression test.

## Phase 4: Functional UI

**Status: Done**

- [x] Dashboard, project grid/list, detail, settings shell.
- [x] Status dan action project konsisten untuk start/stop.
- [x] Loading, empty state, modal, toast.
- [x] Theme dark/light.
- [x] Terapkan search, filter type/status, dan sort.
- [x] Implement bulk start, stop, dan delete selected.
- [x] Perbaiki CommandPalette contract dan keyboard navigation.
- [x] Hubungkan Project Detail settings save.
- [x] Buat crash banner berdasarkan event nyata.
- [x] Hilangkan mock resource chart/activity atau tandai eksplisit.
- [x] Hapus DemoPanel dari production UI.
- [x] Putuskan/hapus tree legacy `Pages/`, `Project/`, `Terminal/` dan Zustand bila tidak dipakai.
- [x] Pecah orchestration `App.jsx` setelah behavior stabil.

Acceptance criteria:

- Setiap kontrol visible punya behavior nyata atau label demo.
- Semua view memakai source of truth sama.
- Tidak ada duplicate component path untuk fungsi sama.
- Empty/error/loading/action states teruji.

## Phase 5: Native Desktop Integration

**Status: Done**

- [x] Open URL via `shell.openExternal` dengan validasi localhost/URL.
- [x] Reveal path via `shell.showItemInFolder`.
- [x] Open editor melalui pilihan executable/command yang tervalidasi.
- [x] Native Electron `Tray` dan menu.
- [x] Minimize-to-tray behavior.
- [x] OS startup via `app.setLoginItemSettings`.
- [x] Native notifications untuk start/crash sesuai config.
- [x] Hapus renderer fake tray setelah native tray selesai.
- [x] Definisikan behavior close vs quit dengan jelas.

Dependency install sengaja bukan target awal. Menjalankan package manager dari UI menambah security dan lifecycle complexity; tambahkan hanya jika use case terbukti.

Acceptance criteria:

- Semua setting desktop mengubah behavior OS, bukan hanya JSON.
- Close/minimize/quit tidak membingungkan dan tidak meninggalkan process.
- Native action memvalidasi path/URL.

## Phase 6: Port dan Resource Monitoring

**Status: Done**

- [x] Deteksi port availability sebelum start.
- [x] Identifikasi owner PID secara aman pada Windows.
- [x] Resolver: cancel, pilih port lain, atau stop process yang dikelola DevLauncher.
- [x] Jangan kill arbitrary process tanpa konfirmasi kuat dan detail PID/executable.
- [x] Deteksi port siap setelah start sebelum status healthy.
- [x] CPU dan memory metrics per managed process tree.
- [x] Uptime aktual.
- [x] Batasi polling dan stop polling saat window/app tidak aktif.

Acceptance criteria:

- Konflik port tidak menghasilkan status Running palsu.
- Arbitrary process tidak dibunuh diam-diam.
- Metrics tidak membebani CPU secara signifikan dan dibersihkan saat process exit.

## Phase 7: Security Hardening

**Status: Pending, release blocker**

- [ ] Tentukan command model: executable + args terstruktur, atau dokumentasikan local-trust model secara formal.
- [ ] Kurangi penggunaan `shell: true`; gunakan hanya untuk command yang memang membutuhkan shell.
- [ ] Validasi seluruh IPC payload di main process.
- [ ] Allowlist field `update-project`; larang perubahan ID/runtime field.
- [ ] Allowlist channel listener dan hapus public `removeAllListeners` bila tidak perlu.
- [ ] Redact sensitive env values dari log/debug output.
- [ ] Tambahkan CSP dan audit external navigation.
- [ ] Threat model untuk project path, command, env, symlink, dan backup data.

Acceptance criteria:

- Security review tidak menemukan arbitrary IPC capability di renderer.
- Untrusted UI input tidak membentuk shell command tanpa validasi/consent.
- Secrets tidak muncul di app log.

## Phase 8: Config dan Migration

**Status: Pending, release blocker**

- [x] Pilih nested config schema tunggal.
- [x] Migrasikan key lama tanpa kehilangan preference.
- [x] Satu config source of truth di renderer aktif.
- [ ] Terapkan terminal font size, max lines, dan auto-scroll ke viewer nyata.
- [ ] Terapkan sidebar default.
- [ ] Versioning untuk `projects.json` dan `config.json`.
- [ ] Backup sebelum migration dan rollback pada gagal.

Acceptance criteria:

- Setiap setting visible bertahan dan memengaruhi behavior.
- Upgrade data lama diuji.
- Unknown/corrupt config menghasilkan UX jelas, bukan silent loss.

## Phase 9: Quality, Accessibility, dan Observability

**Status: Pending, release blocker**

- [ ] Unit test ProjectDetector dan StorageManager.
- [ ] Test project CRUD handler dengan temp data. Storage transaction/recovery sudah diuji.
- [ ] Test process lifecycle termasuk timeout, signal, duplicate start, Start All partial failure.
- [ ] Renderer component/hook tests untuk status transitions.
- [ ] Automated Electron smoke test.
- [ ] CI Windows: install, test, build renderer, package.
- [ ] ESLint config/script modern.
- [ ] Accessibility audit: names, focus trap, keyboard, contrast, reduced motion.
- [ ] Structured logging dan lokasi log diagnostik.
- [ ] Remove debug console noise dari production.
- [ ] Test storage permission failure, corrupt JSON, missing runtime, invalid path, dan app crash.

Acceptance criteria:

- CI hijau pada clean checkout.
- Critical flows punya regression tests.
- Keyboard-only flow add/start/stop/delete bekerja.
- Failure bisa didiagnosis tanpa DevTools.

## Phase 10: Distribution dan Release

**Status: Blocked oleh Phase 1, 7, 8, 9**

- [ ] Final app ID, product name, author, license metadata.
- [ ] Icons, installer branding, artifact naming.
- [ ] Version strategy dan changelog.
- [ ] Build NSIS + portable x64.
- [ ] Install/uninstall smoke test di Windows bersih.
- [ ] Test path dengan spasi dan user non-admin.
- [ ] Code signing decision dan certificate bila didistribusikan luas.
- [ ] Update strategy atau dokumentasi manual update.
- [ ] Privacy/security notice untuk local command execution.
- [ ] Release notes dan known limitations.

Acceptance criteria:

- Installer dan portable start di clean Windows VM.
- Add/start/stop/restart/close/reopen lulus.
- Uninstall tidak menghapus user data tanpa consent.
- Artifact dapat direproduksi dari tagged commit.

## Definition of Done

Release pertama dianggap selesai hanya jika:

- [ ] Tidak ada fitur visible yang diam-diam mock.
- [ ] Project CRUD dan edit lengkap.
- [ ] Search/filter/sort dan bulk action benar.
- [ ] Process lifecycle tidak meninggalkan orphan.
- [ ] PID, status, exit, dan log selalu konsisten.
- [ ] Config schema tunggal dan migration diuji.
- [ ] Security blockers selesai.
- [ ] Accessibility critical paths lulus.
- [ ] `npm test`, lint, renderer build, dan Electron smoke test lulus di CI.
- [ ] NSIS dan portable diuji pada clean Windows.
- [ ] Dokumentasi sesuai release commit.

## Urutan Eksekusi Disarankan

1. Selesaikan schema project/config dan storage serialization.
2. Perbaiki UI wiring aktif; hapus mock/legacy yang tidak dipakai.
3. Lengkapi process/log edge cases dan tests.
4. Security hardening command + IPC.
5. Native desktop integration.
6. Port/resource monitoring jika tetap dibutuhkan.
7. Accessibility, CI, packaging, clean-machine release test.
