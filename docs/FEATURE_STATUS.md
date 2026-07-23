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
| Edit project | Pending | Backend update ada, UI edit belum terhubung |
| Framework detection | Done | Laravel, Next, React/Vite, Vue, Go, Node, Custom |
| Storage backup/recovery | Done | 5 backup project, recovery JSON corrupt |
| Config persistence | Partial | Berfungsi, tetapi schema backend/renderer ganda |

## Process

| Feature | Status | Catatan |
|---|---|---|
| Start project | Done | Path/command dikirim melalui IPC |
| Stop project | Done | Status `Stopping`, process-tree kill, PID dibersihkan |
| Restart project | Done | Stop + delay + start |
| Start All | Partial | Membaca storage; env shape tidak sama dengan individual start |
| Stop All | Done | Menunggu semua running process |
| Cleanup saat app close | Done | `before-quit` stop all; dev script juga stop Vite |
| Real-time stdout/stderr | Done | IPC event ke Project Detail |
| Backend log limit | Done | Maksimal 1000 entry per process |
| Frontend log limit | Pending | Array frontend dapat terus tumbuh |
| Crash/error status | Partial | Non-zero exit jadi error; UX crash banner masih belum event-driven penuh |
| CPU/RAM metrics | Mock | Dashboard menampilkan placeholder |
| Port conflict detection | Mock | Modal hard-coded, backend detector belum ada |

## UI

| Feature | Status | Catatan |
|---|---|---|
| Dashboard | Partial | Project/activity bekerja; chart/resource mock |
| Project grid | Done | Start/stop/status/detail terhubung |
| Project list mode | Done | Start/stop/status terhubung |
| Project Detail | Partial | Lifecycle/log bekerja; settings save belum terhubung |
| Stopping state | Done | Detail, dashboard card/table, grid/list |
| PID cleanup | Done | Null setelah exit/stop |
| Search/filter/sort | Pending | State ada, daftar belum diproses |
| Bulk start/stop/delete | Mock | Handler masih `console.log`/placeholder |
| Command palette | Broken/Partial | Prop dan item shape tidak cocok dengan App wiring |
| Keyboard shortcuts | Partial | Ctrl/Cmd+K, Escape, `?`; shortcut lain hanya didokumentasikan UI |
| Toast | Partial | Bekerja, dua auto-dismiss timer berbeda |
| Theme | Done | Dark/light disimpan dan diterapkan |
| Settings | Partial | Nilai tersimpan; beberapa setting belum punya behavior native |

## Desktop Integration

| Feature | Status | Catatan |
|---|---|---|
| Browse folder | Done | Electron dialog |
| Open localhost URL | Mock | Saat ini hanya toast |
| Open editor | Mock | Saat ini hanya toast |
| Reveal in Explorer | Mock | Saat ini hanya toast |
| Install dependencies | Mock | Timer toast, tidak menjalankan command |
| Native system tray | Pending | TrayIcon/TrayPopup hanya overlay renderer dan wiring belum cocok |
| Minimize to tray | Pending | Config ada, behavior tidak ada |
| Start on OS boot | Pending | Config ada, `setLoginItemSettings` belum digunakan |
| Native notifications | Pending | Config/UI ada, Electron Notification belum digunakan |

## Quality dan Release

| Feature | Status | Catatan |
|---|---|---|
| ProcessManager regression test | Done | `npm test` |
| Renderer production build | Done | `npx vite build` |
| Unit test storage/detector/hooks | Pending | Belum ada |
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
- `SettingsView` membuat instance config hook sendiri, terpisah dari App.
- `ProjectDetailView` mendukung `onSave`, App tidak memasoknya.
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
