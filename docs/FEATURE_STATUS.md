# Feature Status

Status ini berdasarkan source saat dokumentasi dibuat, bukan target roadmap.

Legend:

- **Done**: flow utama terhubung dan diverifikasi build/test dasar.
- **Partial**: sebagian bekerja, ada gap penting.
- **Mock**: UI/demo ada tanpa behavior backend nyata.
- **Pending**: belum tersedia.

## Core

| Feature | Status | Catatan |
|---|---|---|
| Electron + React startup | Done | Development memuat Vite port 5173 |
| Secure renderer boundary | Partial | isolation aktif; validasi IPC belum lengkap |
| Project list/load | Done | JSON di Electron `userData` |
| Add project | Done | Validation dasar + duplicate name/path |
| Delete project | Done | Running process dihentikan dulu |
| Edit project | Done | Modal yang sama dipakai untuk add/edit |
| Framework detection | Done | Laravel, Next, React/Vite, Vue, Go, Node, Custom |
| Storage backup/recovery | Done | 5 backup project, recovery JSON corrupt |
| Concurrent storage mutation | Done | Queue project/config + transactional project updates |
| Config persistence | Done | Schema nested canonical + migrasi key flat lama |

## Process

| Feature | Status | Catatan |
|---|---|---|
| Start project | Done | Path/command dikirim melalui IPC |
| Stop project | Done | Status `Stopping`, process-tree kill, PID dibersihkan |
| Restart project | Done | Stop + delay + start |
| Start All | Done | Membaca storage dan memakai canonical `envVars` |
| Stop All | Done | Menunggu semua running process |
| Cleanup saat app close | Done | `before-quit` stop all; dev script juga stop Vite |
| Real-time stdout/stderr | Done | IPC event ke Project Detail |
| Backend log limit | Done | Maksimal 1000 entry per process |
| Frontend log limit | Done | Buffer renderer dibatasi 1000 entry per project |
| Crash/error status | Done | Non-zero exit jadi error; crash banner dismissible per error signature |
| CPU/RAM metrics | Done | `project-resource-update` push + 4s polling di dashboard |
| Port conflict detection | Done | `check-port-conflict` + PortConflictModal + bulk preflight |

## UI

| Feature | Status | Catatan |
|---|---|---|
| Workspace dashboard | Done | Status, running projects, latest output, activity, dan lifecycle memakai data nyata |
| Projects registry | Done | Table, search, filter type/status, lifecycle, edit, delete, dan detail terhubung |
| Terminals workspace | Done | Output per project dan aggregate real-time; hydrate backend logs setelah reload; interactive PTY shell |
| Project Detail | Done | Lifecycle, terminal, environment (env file viewer/editor), settings, embedded App preview |
| Stopping state | Done | Detail, dashboard card/table, grid/list |
| PID cleanup | Done | Null setelah exit/stop |
| Search/filter/sort | Done | Search, filter type/status, serta sorting (name, status, type, port) sudah terhubung |
| Bulk start/stop/delete | Done | Multi-select checkbox dan BulkToolbar sudah terpasang |
| Command palette | Done | Prop, item shape, default actions, dan navigasi project sudah terhubung |
| Keyboard shortcuts | Done | Ctrl/Cmd+K, Ctrl+N, Ctrl+Shift+S/X, Escape, `?` semua terimplementasi |
| Toast | Partial | Bekerja, dua auto-dismiss timer berbeda |
| Theme | Done | Dark/light disimpan dan diterapkan |
| Settings | Done | Theme, sidebar, tray, start-on-boot, autoStartProjects, notifications (onStart/onError/sound), terminal (fontSize/maxLines/autoScroll) semua berfungsi |

## Desktop Integration

| Feature | Status | Catatan |
|---|---|---|
| Browse folder | Done | Electron dialog |
| Embedded localhost app | Done | Terhubung dengan tab AppPreviewTab & iframe interaktif saat project RUNNING |
| Open editor | Done | Buka path folder via `shell.openPath` / IPC |
| Reveal in Explorer | Done | Buka lokasi folder via `shell.showItemInFolder` / IPC |
| Install dependencies | Pending | Aksi demo dilepas sampai runner tersedia |
| Native system tray | Done | Native Electron Tray dengan context menu interaktif |
| Minimize to tray | Done | Ditangani saat window `close` event sesuai `config.minimizeToTray` |
| Start on OS boot | Done | Diatur via `app.setLoginItemSettings` |
| Native notifications | Done | Notifikasi OS native saat project crash/error |

## Quality dan Release

| Feature | Status | Catatan |
|---|---|---|
| ProcessManager regression test | Done | `npm test` |
| Renderer production build | Done | `npx vite build` |
| Unit test storage/detector/hooks | Done | Vitest setup, ProjectDetector.test.js, StorageManager.test.js created |
| Electron integration/smoke automation | Done | Playwright E2E (`npm run test:e2e`) launches the app, checks navigation |
| Lint command | Done | ESLint configured with @eslint/js + react-hooks plugin |
| Type checking | Pending | JavaScript without TypeScript/JSDoc check |
| Accessibility audit | Partial | ARIA labels on buttons/focusable elements added, keyboard shortcuts documented, contrast compliance |
| Windows installer | Blocked | Asset `build/icon.ico/png` belum ada |
| Clean machine validation | Pending | Belum dibuktikan |
| Code signing/update | Pending | Belum dirancang |

## Known Wiring Gaps

Tidak ada gap aktif. Semua handler IPC dan push channel terhubung ke renderer.

## Manual Smoke Checklist

- [ ] `npm run dev` membuka Electron dan DevTools.
- [ ] Add project memakai folder picker dan detection.
- [ ] Duplicate name/path ditolak.
- [ ] Start project menampilkan `Starting`, lalu `Running` dan PID.
- [ ] Log stdout/stderr muncul.
- [ ] Stop menampilkan `Stopping` dan tombol disabled.
- [ ] Setelah stop, status `Stopped` dan PID hilang di detail/card/table.
- [ ] Restart menghasilkan PID/process baru.
- [ ] Delete running project menghentikan process dan menghapus record.
- [ ] Close app menghentikan child process dan Vite tanpa Ctrl+C.
- [ ] Reopen app memuat project dengan status `Stopped`.
- [ ] Theme bertahan setelah restart.
- [ ] `npm test` lulus.
- [ ] `npx vite build` lulus.

Task menuju status release dijelaskan di [Roadmap](ROADMAP.md).
