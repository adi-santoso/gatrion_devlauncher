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
| Secure renderer boundary | Done | isolation aktif; validasi IPC lengkap; CSP diterapkan main process (dev + production) |
| Project list/load | Done | JSON di Electron `userData` |
| Add project | Done | Validation dasar + duplicate name/path |
| Delete project | Done | Running process dihentikan dulu |
| Edit project | Done | Modal yang sama dipakai untuk add/edit |
| Framework detection | Done | Laravel, Next, React/Vite, Vue, Go, Node, Custom |
| Storage backup/recovery | Done | 5 backup project, recovery JSON corrupt |
| Concurrent storage mutation | Done | Queue project/config + transactional project updates |
| Config persistence | Done | Schema nested canonical + migrasi key flat lama |
| Project schema v3 | Done | `tags`, `customCommands`, `dependsOn` + schemaVersion 3 dengan normalisasi/validasi |
| Tags | Done | Filter di ProjectsView, badge di row/card, grouping dashboard |
| Drag & drop folder | Done | Drop folder ke window auto-fill ProjectModal via `detectProjectType` |
| Duplicate project | Done | Prefill modal create dari project existing (config lengkap: tags, customCommands, dependsOn) |
| Export / Import | Done | JSON portabel via dialog; import merge tanpa menimpa (skip duplikat) |

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
| Custom commands | Done | `customCommands` per project, run/stop via IPC, output ke log project, dihentikan saat quit |
| Dependency ordering | Done | `start-all-projects` topological sort berdasarkan `dependsOn` |
| Auto-restart composite | Done | Restart memakai seluruh commands array + menunggu port lama dilepas |
| Resource sparkline | Done | History 30 sampel per project, sparkline CPU/RAM di dashboard card |

## UI

| Feature | Status | Catatan |
|---|---|---|
| Workspace dashboard | Done | Status, running projects, latest output, activity, dan lifecycle memakai data nyata |
| Projects registry | Done | Table, search, filter type/status, lifecycle, edit, delete, dan detail terhubung |
| Terminals workspace | Done | Output per project dan aggregate real-time; hydrate backend logs setelah reload; interactive PTY shell |
| Project Detail | Done | Lifecycle, terminal, environment (env file viewer/editor), settings, Git tab, Script runner, embedded App preview |
| Git integration | Done | Tab Git: status, stage/unstage, commit, log, diff, checkout branch, pull/push, init, **stash** (save/pop/apply/drop), **discard changes** (dengan konfirmasi), **git blame** — via IPC tervalidasi |
| Dependency manager | Done | Tab Dependencies: `npm outdated` (tabel current/wanted/latest), update per package / massal dengan backup package.json & lockfile otomatis |
| Env profiles & secrets | Done | Environment tab: quick-switch profile (base/dev/staging/production), nilai rahasia (KEY/TOKEN/SECRET/PASSWORD) di-mask + toggle reveal |
| Health & analytics | Done | Tab Analytics: crash history, run history + uptime, total runs/uptime, trend CPU/memory harian, clear history (persist ke userData/health.json) |
| System environment check | Done | Kartu di Settings: deteksi 17 tools (node, npm, git, php, composer, python, go, java, docker, mysql, redis, omp, dll) + versi + re-check |
| Update checker | Done | Cek rilis terbaru GitHub saat Settings dibuka + banner "versi baru tersedia" |
| JSDoc typecheck | Partial | `npm run typecheck` (tsc) untuk file baru bertanda `// @ts-check` (systemHandlers, HealthManager, prayerTimes); perluasan bertahap |
| Script runner | Done | Tab Scripts: jalankan script `package.json` + health check dependency |
| Animation system | Done | AnimatedModal (entrance + exit), toast slide, sliding tab indicator, theme transition, press feedback, skeleton shimmer |
| Pengingat Sholat | Done | Widget sidebar/topbar (bisa diatur/dinonaktifkan), countdown live per detik, algoritma PrayTimes offline (Kemenag RI + 5 metode), geocode kota, panel floating expand, notifikasi + suara |
| Stopping state | Done | Detail, dashboard card/table, grid/list |
| PID cleanup | Done | Null setelah exit/stop |
| Search/filter/sort | Done | Search, filter type/status, serta sorting (name, status, type, port) sudah terhubung |
| Bulk start/stop/delete | Done | Multi-select checkbox dan BulkToolbar sudah terpasang |
| Command palette | Done | Prop, item shape, default actions, dan navigasi project sudah terhubung |
| Keyboard shortcuts | Done | Ctrl/Cmd+K, Ctrl+N, Ctrl+Shift+S/X, Escape, `?` semua terimplementasi |
| Toast | Partial | Bekerja, dua auto-dismiss timer berbeda |
| Theme | Done | Dark/light disimpan dan diterapkan |
| Workspace presets | Done | Preset v2: kartu preset dengan badge status, start/stop/restart, edit modal (deskripsi/warna/stagger delay/auto-start), duplicate, reorder, ordered project list, progress start per project |
| Log search & filter | Done | Search + highlight + filter type (stdout/stderr/error/warn/system) di LogsTab dan Terminal workspace |
| Shell per project | Done | Terminal workspace membuka shell interaktif di folder project terpilih (cwd) |
| Dashboard group by tag | Done | Toggle "Group by tag" di dashboard (termasuk grup untagged) |
| Settings | Done | Theme, sidebar, tray, start-on-boot, autoStartProjects, notifications, terminal, pengingat sholat, **system environment check**, **update checker banner** — semua berfungsi |

## Desktop Integration

| Feature | Status | Catatan |
|---|---|---|
| Browse folder | Done | Electron dialog |
| Embedded localhost app | Done | Tab AppPreview: native WebContentsView dengan sesi persisten per project (cookies/storage bertahan), mode focus (DevTools + prev/next), fallback iframe |
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
| Windows installer | Partial | Ikon aplikasi (motif G, purple gradient) digenerate via `npm run icons` → `build/icon.ico/png/tray`; build NSIS/portable belum dijalankan penuh |
| Clean machine validation | Pending | Belum dibuktikan |
| Code signing/update | Pending | Belum dirancang |
| CI pipeline | Done | GitHub Actions Windows: lint, `npm test`, vitest, `vite build`, Playwright e2e |
| CSP | Done | `Content-Security-Policy` di main process; dev mengizinkan inline script Vite |

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
