# Roadmap DevLauncher v2 — Agent Workspace & Kompetisi

> **STATUS: DRAFT** (18 Agu 2026) — disusun dari analisa kompetitor (Taurus, Dev Home, Laragon) + kondisi kode saat ini (v0.2.6). Acuan sebelumnya: [ROADMAP.md](ROADMAP.md) (selesai) dan [ROADMAP_AGENT_MCP.md](ROADMAP_AGENT_MCP.md) (F0–F4 selesai).
>
> **Tesis**: DevLauncher sudah unggul di *lifecycle process + preview + MCP control* (tidak ada kompetitor yang menggabungkan semuanya). Gap terbesar sekarang ada di **UX agent**: Taurus (Tauri, Windows) menang di *multi-agent tabs, dropzone, inline preview, agent-ready attention*. Fase-fase di bawah menutup gap itu dengan memakai fondasi yang sudah ada (omp subagent, PreviewManager, notifikasi Windows), bukan membangun dari nol.

## Posisi kompetitif (ringkas)

| Kemampuan | DevLauncher | Taurus | Laragon | Dev Home (mati) |
|---|---|---|---|---|
| Lifecycle process + monitoring | ✅ kuat | ❌ | ⚠️ stack-level | ❌ |
| Preview embedded + fullscreen | ✅ | ⚠️ inline html/md saja | ❌ | ❌ |
| Agent chat di app | ✅ (omp) | ✅ (Claude Code) | ❌ | ❌ |
| Agent → kontrol app (MCP + izin) | ✅ 44 tool + permission | ❌ | ❌ | ❌ |
| Multi-agent tab paralel | ❌ **gap** | ✅ | ❌ | ❌ |
| Drop file ke prompt agent | ❌ **gap** | ✅ DROPZONE | ❌ | ❌ |
| Inline preview hasil agent | ❌ **gap** | ✅ | ❌ | ❌ |
| Notifikasi "agent selesai" | ⚠️ notif project | ✅ flash + voice | ❌ | ❌ |

Catatan penting: **omp (agent bawaan) sudah punya subagent native** — `omp-get-subagents`, `omp-handoff`, `omp-set-subagent-subscription` sudah ada di `electron/handlers/agentHandlers.ts`. Fase multi-agent tidak perlu membuat sistem paralel baru; cukup UI yang memanfaatkan kemampuan ini.

## Fase

Skala effort: **S** ≤ 1 hari, **M** beberapa hari, **L** minggu.

---

### F0 — Dropzone file ke prompt agent (P0, S)

Seret file/folder dari Explorer ke area chat → path (atau path + isi singkat) masuk ke composer sebagai lampiran prompt. Tidak ada upload — murni lokal, seperti DROPZONE Taurus.

- **Ruang**: `src/components/Agent/ChatComposer.tsx` + `agentChatUtils.ts`; sudah ada `imageAttachment.ts` (paste gambar) sebagai pola.
- **Detail**: handler `onDrop` di area chat → ambil path dari `File.path` (Electron) → sisipkan teks `[path]` atau `@path` ke composer; untuk file kecil (≤ threshold) bisa langsung sisipkan isinya; folder → hanya path. Path perlu di-escape agar aman di prompt.
- **Acceptance criteria**:
  - Drag satu file dari Explorer → path muncul di composer (bukan teks terbuka di window — `preventDefault` di `dragover`/`drop`)
  - Drag folder → hanya path yang masuk, tidak ada proses rekursif
  - Paste path teks biasa tetap bekerja seperti sekarang
  - Unit test: helper sisip path (escape, dedupe), komponen menerima drop event
  - e2e: simulasi drop via `DataTransfer` dengan file fixture → composer berisi path

---

### F1 — Inline HTML/Markdown preview hasil agent (P1, M)

Saat agent mengembalikan path `.html`/`.md` (atau blok output yang mengandung keduanya), tampilkan pane preview inline di chat dengan toggle raw/rendered — sandboxed, escape-first (pola Taurus).

- **Ruang**: `src/components/Agent/MessageBubble.tsx`/`Markdown.tsx` + renderer path→konten via IPC `read-file` (sudah ada untuk env file, buat channel umum atau pakai `fs` read lewat channel baru yang divalidasi `CHANNEL_RULES`).
- **Keamanan (wajib)**:
  - HTML dirender di **iframe sandboxed** (`sandbox` tanpa `allow-scripts`, tanpa same-origin) — bukan `dangerouslySetInnerHTML`
  - Markdown escape-first: HTML mentah tidak pernah dieksekusi; `javascript:`/`data:` link di-strip (pola renderer Markdown existing diperiksa & di-hardening)
  - Hanya path di dalam project yang bisa di-preview (cegah path traversal)
- **Acceptance criteria**:
  - Path `.md`/`.html` dalam pesan agent → tombol preview → pane terbuka di samping/bawah chat
  - Toggle raw/rendered berfungsi; link eksternal buka browser default
  - HTML berisi `<script>` → tidak pernah jalan (test: fixture dengan script berbahaya)
  - Path traversal (`../`) ditolak
  - Unit test renderer + e2e: agent (mock omp) mengembalikan path `.md` → preview tampil

---

### F2 — Notifikasi "agent selesai" + attention flash (P1, M)

Beri tahu user saat agent benar-benar selesai dan menunggu respons: flash sesi di sidebar + notifikasi Windows (pola `setupProjectNotifications` di `electron/notifications`).

- **Ruang**: `electron/handlers/agentHandlers.ts` (event `omp-event` sudah streaming state; tambah deteksi transisi busy→idle), `electron/notifications` (action button "Buka agent"), `src/components/Agent/AgentSessionSidebar.tsx` + `AgentView.tsx` (flash/highlight).
- **Pitfall (belajar dari Taurus)**: deteksi "selesai" harus berdasarkan **state nyata** omp (busy/thinking selesai, bukan jeda output), agar tidak ada false "ready" saat agent diam sebentar di tengah task. `omp-get-state` + `omp-event` sudah menyediakan bahan ini.
- **Acceptance criteria**:
  - Agent selesai → notifikasi Windows "Agent siap — <project>" dengan action buka chat
  - Sesi yang menunggu mendapat badge/flash warna di sidebar; hilang saat user membuka sesi
  - Tidak ada notifikasi saat agent sedang berpikir lalu lanjut (false positive < threshold)
  - Unit test: state machine busy→idle memicu event; e2e: mock omp selesai → notifikasi/UI marker muncul

---

### F3 — Multi-agent workspace: tab agent per project (P1, M–L)

Satu view Agent dengan **tab paralel** — beberapa sesi agent (beda project / beda sesi) aktif bersamaan, switch via tab, reorder drag, kanan-klik restart/resume. Memakai subagent native omp.

- **Ruang**:
  - `src/components/Agent/AgentView.tsx` — dari "satu sesi aktif" (`activeSession`) menjadi daftar tab sesi aktif (`activeSessions[]`), sesi lain tetap hidup di background (chat streaming dipertahankan seperti sekarang)
  - `AgentSessionSidebar.tsx` — sidebar tetap sebagai katalog; tab bar baru di atas chat untuk sesi yang sedang dibuka
  - Backend: tidak ada channel baru wajib — subagent omp (`omp-get-subagents`, `omp-handoff`) dipakai untuk delegasi; sesi paralel cukup beberapa sesi omp yang berjalan (omp RPC sudah session-scoped)
- **Pembagian dua level**:
  - **F3a (M)**: multi-sesi tab (paralel sesi omp per project) — user bisa buka 2–3 sesi sekaligus, switch tab, tutup tab
  - **F3b (L)**: subagent orchestration — tab utama mendelegasikan task ke subagent (via `omp-handoff`/`omp-set-subagent-subscription`), hasil subagent muncul di tab turunan; ini memakai kemampuan omp yang handler-nya sudah ada
- **Acceptance criteria (F3a)**:
  - Buka sesi project A dan B → dua tab, switch tanpa kehilangan streaming/scroll posisi
  - Tab bisa ditutup (sesi tetap tersimpan di registry) dan dibuka lagi dari sidebar
  - Restart tab → resume percakapan sesi yang sama (`omp-create-session` + `omp-get-messages`)
  - e2e: mock omp, dua sesi paralel, streaming keduanya, switch tab
- **Acceptance criteria (F3b)**:
  - Agent utama bisa memanggil subagent (mock omp mendukung) → tab subagent baru muncul dengan percakapannya
  - Hasil subagent bisa di-handoff kembali ke agent utama
  - Unit test: pemetaan event subagent → UI tab turunan

---

### F4 — Remote host via SSH (P2, L) — *ditunda, dicatat*

Jalankan agent (atau command project) di mesin lain via SSH, sesi bertahan walau koneksi putus (pola Taurus: `Runs on` + attach ke sesi remote). Butuh infra baru (SSH client di main process, list host, security review) dan verifikasi runtime nyata — bukan prioritas sampai F0–F3 terbukti dipakai.

---

## Non-goals fase ini (dicatat supaya fokus)

- **Voice STT/TTS** — effort besar, nilai belum jelas untuk DevLauncher; bisa direvisi setelah F2
- **White-label & skins** — relevan untuk distribusi enterprise, tapi bukan sebelum UX agent solid
- **Demo mode** — sudah ada padanan: mock omp untuk e2e
- **Per-project domain (`.test`)** ala Laragon — ide terpisah, masuk roadmap v3 potensial

## Sukses & cara ukur

- Setiap fase **tidak dianggap selesai sampai acceptance criteria terverifikasi** (unit + e2e, pola roadmap sebelumnya)
- Metrik produk: sesi agent aktif per hari, waktu dari agent selesai → user merespons (F2 menargetkan penurunan)
- Kompetisi: F3 adalah diferensiasi yang belum dimiliki kompetitor mana pun (launcher + multi-agent + MCP control)
