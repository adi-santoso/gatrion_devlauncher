# VPS: perbaikan audit independen

Tanggal: 1 Oktober 2026 (audit dimulai 30 September). Dokumen ini memperbarui status pada
[VPS_AUDIT.md](VPS_AUDIT.md), yang menyimpan handoff awal sebelum audit independen.

## Perubahan

| Temuan | Perbaikan | Bukti regression |
|---|---|---|
| Probe login sebelum trust | Probe menghentikan handshake setelah memperoleh fingerprint, tanpa autentikasi | Fixture tidak menerima authentication attempt |
| Error SSH tidak tertangani | Event connection-error ditangani manager; status error, scope dicabut, job unknown | Error koneksi tidak melempar exception tak tertangani |
| RPC memakai konteks sesi lama | RPC diganti saat cwd/scope berubah; output/exit proses lama diabaikan | PID dan scope berubah pada switch sesi serta reconnect |
| Reconnect tidak menyiapkan scope | UI mengikat context ke sesi dan connectedAt; tidak menampilkan chat dengan konteks lama | Test VpsChat switch/disconnect/reconnect |
| Buffer transport tanpa batas | Stdout/stderr dibatasi terpisah; timeout/cancel settle tanpa menunggu peer | Stream beberapa MB tetap terbatas; peer mengabaikan close tidak menggantung |
| Raw secret chunk lewat IPC | IPC hanya membawa snapshot output ter-redaksi; line buffering menangani split secret/private key | Stream password terpotong dan key multiline tidak bocor |
| Restart gagal dianggap sukses | Status systemctl dipertahankan, unit divalidasi, kemudian is-active diperiksa | Restart gagal menghasilkan job failed/exitCode=1 |
| Prune menghapus job aktif | Hanya job selesai dipangkas; concurrency exec dibatasi 8/server | Job panjang tetap dapat diakses setelah 55 job pendek |

Perbaikan tambahan:

- Config MCP menggunakan `${DEVLAUNCHER_VPS_TOKEN}`; bearer token disuntikkan hanya ke
  environment child omp yang sesuai. Config tidak dihapus berdasarkan timer 20 detik.
- Guard extension terkelola membatasi active tools dan memblokir tool_call di luar tujuh tool
  VPS. Built-in bash/file/task, ekstensi/skills/rules ambient, dan LSP dinonaktifkan pada startup.
  Local bash RPC dan injeksi host tool juga ditolak untuk target VPS.
- Temuan melalui omp 18.2.6 asli: `--no-tools` saja tidak cukup; tool memori dan MCP ambient
  tetap terlihat. Guard diuji dengan MCP tambahan dan hanya tool VPS masuk request model.
- Approval diperiksa ulang sesudah keputusan: policy, scope, izin global, metadata server,
  dan identitas koneksi harus tetap sama. Target berubah meminta approval baru.
- Perubahan host/port/user memutus koneksi dan menghapus trust endpoint sebelumnya.
- Session ID yang dapat menavigasi path ditolak; revoke tidak menghapus direktori context
  secara rekursif. Validasi command dilakukan sebelum job didaftarkan.
- Fokus chat dapat dikembalikan ke detail pada window lebar. Terminal VPS mendukung paste
  Ctrl+V/Shift+Insert dan copy seleksi; Ctrl+C tanpa seleksi tetap mengirim ETX remote.
- Kepemilikan terminal mencegah cleanup mount React lama menutup shell mount baru;
  pembukaan serentak dideduplikasi dan reconnect membuat terminal baru. Uji keyboard,
  paste, interrupt, resize, serta input sesudah reconnect melewati SSH fixture.
- Panel chat berdampingan tampil mulai lebar 1536 px; window lebih kecil memakai fokus
  chat/detail agar panel overview tidak terjepit. Screenshot dark/light/narrow diperiksa.
- Fixture key divalidasi sebelum dipakai: generator ssh2 1.17 kadang menghasilkan key
  yang ditolak parser sendiri (reproduksi terpisah: 1 dari 1000 key). Cleanup mock RPC
  menunggu proses close sebelum menghapus cwd untuk menghindari EBUSY Windows.

## Verifikasi

Hasil akhir lint, typecheck, unit, E2E, build, dan packaged smoke dicatat setelah selesai
di bagian hasil akhir di bawah. Log lokal `.vps-*-audit.log` tidak termasuk source Git.

`scripts/vps-omp-tools-smoke.cjs` memakai **omp asli**, model OpenAI-compatible fixture
di loopback, dan MCP fixture. Tidak memakai kredensial provider atau server production.
Terbukti: initialize/discovery, ekspansi token environment, active tool isolation meskipun
MCP ambient tersedia, satu tools/call, event tool_execution_start/end, serta dua request
model (tool call dan jawaban sesudah hasil tool).

Ini memverifikasi engine/protokol agent; model fixture tidak membuktikan mutu penalaran
model production, dan MCP fixture bukan VPS Linux/systemd nyata.

## Batas yang tetap berlaku

- Uji OpenSSH/systemd nyata pada WSL Ubuntu 24.04 lokal kini lolos (lihat bagian WSL).
  VPS internet, model production, serta alur prompt-model-ke-WSL belum diverifikasi;
  jangan menyamakan smoke packaged IPC ini dengan acceptance manual agent production.
- Guard membatasi kemampuan agent dalam aplikasi; ini bukan sandbox OS untuk aplikasi/proses
  lain yang berjalan sebagai pengguna Windows yang sama.
- Redaksi output adalah pertahanan tambahan. Arbitrary exec tetap dapat membaca secret
  remote dan selalu memerlukan controlled policy + approval; read-only menolaknya.
- Cancel/timeout/disconnect tidak membuktikan remote process mati. Hasil ambigu adalah unknown.
- F5/F6 (SFTP, Docker, deployment, monitoring 24/7) tetap di luar MVP.

## Menjalankan ulang

```powershell
npm run lint
npm run typecheck
npx vitest run --maxWorkers=4
node scripts/vps-omp-tools-smoke.cjs
npm run build
npx playwright test
node scripts/vps-packaged-smoke.cjs
```

Model smoke mengambil `OMP_BINARY` jika ditetapkan; default Windows adalah instalasi omp
di LOCALAPPDATA. Screenshot verifikasi VPS disimpan ke `test-results/vps-audit-*.png` oleh E2E.

## Referensi runtime

Konfigurasi environment placeholder dan discovery mengikuti [dokumentasi MCP omp](https://omp.sh/docs/mcp).
Guard memakai API active tools dan tool_call dari [referensi extension resmi](https://github.com/can1357/oh-my-pi/blob/main/docs/extensions.md).
Perilaku aktual tetap dibuktikan terhadap omp yang terpasang, bukan diasumsikan dari dokumentasi terbaru.

## Hasil akhir

| Pemeriksaan | Hasil |
|---|---|
| Lint | 0 error, 9 warning baseline |
| Typecheck | Lolos |
| Unit suite | 110 file / 1045 test lolos, maxWorkers=4 |
| Full E2E | 37/37 lolos |
| VPS E2E terakhir | 2/2 lolos, termasuk input setelah reconnect |
| omp asli + model/MCP fixture | Lolos: tools/call dan event eksekusi, hanya tool VPS aktif |
| Windows installer + portable 0.2.9 | Terbangun di dist |
| Packaged smoke | 15/15 lolos |
| Visual | Dark/light/narrow diperiksa dari screenshot E2E |
| Linux nyata lokal WSL | 16/16 melalui packaged app, OpenSSH dan systemd asli |

`npm run build` menyelesaikan kompilasi tetapi extraction Electron terkena EPERM pada
rename Windows. Setelah folder runtime berhasil dipindahkan dengan PowerShell,
pengemasan berhasil memakai `npx electron-builder --config.electronDist=dist-vps-audit/win-unpacked`.
Runtime adalah hasil extraction Electron 43.1.1 yang sama, dan app payload berasal dari
build source terbaru; tidak mengubah dependency atau konfigurasi source. Folder bantuan
dist-vps-audit masih tersimpan lokal dan dikecualikan lewat Git info/exclude; cleanup
rekursif ditolak kebijakan eksekusi otomatis. Hasil akhir memakai workaround tersebut dan tidak
diklaim sebagai npm run build tanpa kendala.

## WSL lokal — 1 Oktober 2026

`scripts/vps-wsl-smoke.cjs` menjalankan packaged DevLauncher dengan userData terisolasi,
menargetkan OpenSSH di Ubuntu-24.04 WSL2 pada `127.0.0.1:22222`, user santos,
cwd `/home/santos`. OpenSSH server dipasang karena sebelumnya belum tersedia.
Listener testing dibatasi loopback; ssh.service/ssh.socket default yang baru terpasang
dinonaktifkan. Service probe sementara menulis marker ke journald.

Password yang diberikan pengguna ditolak oleh OpenSSH; password akun tidak diubah.
Login berhasil memakai ed25519 key sementara pada AuthorizedKeysFile terpisah di `/run`,
tanpa mengubah `~/.ssh` santos. Tidak menyimpan password dalam source atau laporan.

Hasil 16/16: packaged runtime, fingerprint handshake dan kecocokan dengan key WSL,
penyimpanan credential terisolasi, unknown host refused, login santos, overview Ubuntu,
service discovery systemd, marker journald, exec dengan identity/cwd yang benar,
exit 7 menjadi failed, PTY open/input, disconnect, trusted reconnect, dan credential
tidak ada pada registry renderer/file. SSH dan unit probe testing dihentikan sesudah uji.

Smoke ini membuktikan transport/backend pada Linux nyata lokal. Ia belum menggunakan
model production untuk memilih command lewat chat; engine omp sebelumnya diuji terpisah
dengan model/MCP fixture. WSL juga tidak mewakili firewall/latensi VPS internet.

### User testing baru

Atas permintaan pengguna dibuat `devlauncher-test`, home `/home/devlauncher-test`,
shell bash, login key-only; password login dinonaktifkan, tanpa sudo. Grup adm memberi
akses journald untuk smoke log. Public key khusus disimpan dalam authorized_keys user
ini; private key Windows berada di `%LOCALAPPDATA%/DevLauncher/wsl-test-ssh/devlauncher-test`.
Smoke packaged diulang dengan `VPS_TEST_USERNAME=devlauncher-test`: **16/16 lolos**.
Tidak mengubah user santos. SSH testing menggunakan loopback port 22222.
Unit `devlauncher-vps-test.service` kini enabled untuk penggunaan ulang saat WSL aktif;
service probe journald dihentikan. WSL perlu tetap berjalan agar endpoint tersedia.

### Perbaikan session chat kosong — 1 Oktober 2026

Laporan pengguna memperlihatkan session bertambah tetapi chat tetap menampilkan
"Start a session". Penyebab: global Agent control default false membuat scope tidak
disiapkan, sementara tombol New session tetap aktif dan empty state mengabaikan
session yang sudah dipilih. Panel kini menjelaskan prerequisite dan menyediakan tombol
Enable Agent control; session lama langsung disiapkan sesudah aktivasi. Saat disconnect,
preparation pending, atau gagal, status berbeda ditampilkan; kegagalan menyediakan retry
session yang sama. Create session dibatasi satu request bersamaan dan nama dropdown
memiliki nomor pembeda. Session pengguna tidak dihapus.

Bukti: 5 unit regression VpsChat lolos; 3 VPS E2E lolos termasuk aktivasi kontrol dengan
session tersimpan dan composer terbuka tanpa duplikasi. Lint 0 error/9 baseline warning
dan typecheck lolos. Paket Windows dibangun ulang dengan runtime Electron terpasang
(`npx electron-builder --config.electronDist=node_modules/electron/dist`).
Packaged smoke sesudah rebuild: 15/15 lolos.

### Resize, reconnect history, dan hapus session

Panel agent kini memiliki pembatas drag pada layout berdampingan: lebar minimal 320 px,
maksimal 1000 px dengan ruang detail minimal 360 px. Lebar tersimpan di localStorage;
ArrowLeft/ArrowRight mengubah ukuran dan double-click/Home mengembalikan 460 px.
Focus chat tetap tersedia di window sempit.

Panel sebelumnya tidak menerima onSessionCreated dari AgentChat sehingga sessionPath
yang baru disimpan backend tidak masuk metadata UI. Sesudah disconnect unmount chat,
session lama masih dianggap baru dan riwayat tidak dimuat. Metadata kini disinkronkan;
scope preparation bergantung pada session ID, bukan perubahan objek metadata, agar
sinkronisasi itu tidak membuang chat di tengah turn.

Tombol Delete session/Hapus sesi meminta konfirmasi dan menghapus session dari registry,
memilih session tersisa serta membersihkan draft. Backend mencabut scope session dan
menghentikan RPC terkait. Transcript omp di disk tidak dihapus oleh operasi registry ini.
Create/switch/delete diblokir saat agent sedang menjalankan turn.

E2E memakai mock omp dengan transcript yang disimpan ke disk untuk membuktikan riwayat
setelah proses diganti saat reconnect dan setelah switch session; juga menguji drag,
keyboard resize, persistence ukuran, serta konfirmasi deletion. Ini bukan inferensi
model production; akses SSH-nya tetap melalui fixture.
Verifikasi akhir perubahan ini: 38 unit/regression test, 3 VPS E2E, packaged smoke
15/15 lolos; typecheck lolos, lint 0 error/9 warning baseline. Installer dan portable
Windows 0.2.9 dibangun ulang sesudah perubahan.
