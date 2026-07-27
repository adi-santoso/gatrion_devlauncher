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
| Crash/error status | Partial | Non-zero exit jadi error; UX crash banner masih belum event-driven penuh |
| CPU/RAM metrics | Pending | Workspace jujur menandai backend monitoring belum tersedia |
| Port conflict detection | Pending | Demo modal dilepas; backend detector belum ada |

## UI

| Feature | Status | Catatan |
|---|---|---|
| Workspace dashboard | Done | Status, running projects, latest output, activity, dan lifecycle memakai data nyata |
| Projects registry | Done | Table, search, filter type/status, lifecycle, edit, delete, dan detail terhubung |
| Terminals workspace | Partial | Output per project dan aggregate real-time; belum hydrate backend logs setelah reload |
| Project Detail | Partial | Lifecycle, terminal, environment, dan settings terhubung; embedded App menunggu backend |
| Stopping state | Done | Detail, dashboard card/table, grid/list |
| PID cleanup | Done | Null setelah exit/stop |
| Search/filter/sort | Done | Search, filter type/status, serta sorting (name, status, type, port) sudah terhubung |
| Bulk start/stop/delete | Done | Multi-select checkbox dan BulkToolbar sudah terpasang |
| Command palette | Done | Prop, item shape, default actions, dan navigasi project sudah terhubung |
| Keyboard shortcuts | Partial | Ctrl/Cmd+K, Escape, `?`; shortcut lain hanya didokumentasikan UI |
| Toast | Partial | Bekerja, dua auto-dismiss timer berbeda |
| Theme | Done | Dark/light disimpan dan diterapkan |
| Settings | Partial | Theme, sidebar, terminal tersimpan otomatis; setting native yang belum bekerja disembunyikan |

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
| Unit test storage/detector/hooks | Partial | Storage ada; detector/hooks belum ada |
| Electron integration/smoke automation | Pending | Hanya manual helper lama/non-runner |
| Lint command | Pending | Config lama ada, dependency/script lint tidak siap |
| Type checking | Pending | JavaScript tanpa TypeScript/JSDoc check |
| Accessibility audit | Pending | Belum ada test; sebagian icon button tanpa accessible name |
| Windows installer | Blocked | Asset `build/icon.ico/png` belum ada |
| Clean machine validation | Pending | Belum dibuktikan |
| Code signing/update | Pending | Belum dirancang |

## Known Wiring Gaps

- `CommandPalette` mengharapkan `onItemSelect`, App mengirim `onSelectCommand`.
- `CommandPalette` memfilter `item.label`, project persisted memakai `name`.
- `TrayPopup` mengharapkan `runningProjects`, App mengirim `projects`.
- Tray item mengharapkan `id`, mapping App saat ini tidak menyertakannya.
- `PortConflictModal` mengharapkan `onClose/onResolve`, App mengirim callback dengan nama lain.
- `clearLogs` hanya membersihkan state frontend; handler backend tidak terpanggil.

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
