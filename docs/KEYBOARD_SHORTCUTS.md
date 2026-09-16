# Keyboard Shortcuts - DevLauncher

Daftar shortcut yang benar-benar terimplementasi di source. `Ctrl` berlaku untuk Windows/Linux, `Cmd` untuk macOS.

## Global (di mana saja)

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Shift + Space` | Panggil/fokus jendela aplikasi (OS global, dari aplikasi lain mana pun) |
| `Ctrl/Cmd + K` | Buka command palette |
| `Ctrl/Cmd + N` | Tambah project baru (buka ProjectModal) |
| `Ctrl/Cmd + Shift + S` | Start semua project |
| `Ctrl/Cmd + Shift + X` | Stop semua project |
| `Escape` | Tutup modal / palette yang sedang terbuka |
| `?` | Buka modal shortcuts (diabaikan saat fokus di input/textarea) |

## Projects view

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + A` | Pilih semua baris (bulk select) |
| `Escape` | Hapus seleksi (saat tidak sedang mengetik) |

## Project Detail — fullscreen preview

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + ←` / `Ctrl/Cmd + →` | Pindah ke project sebelumnya / berikutnya |
| `F12` atau `Ctrl/Cmd + Shift + I` | Buka/tutup DevTools preview (disembunyikan saat emulasi device aktif) |

## Git tab

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Enter` | Commit staged changes (saat pesan commit terisi) |

## Agent chat

| Shortcut | Action |
|----------|--------|
| `Enter` | Kirim pesan |
| `Shift + Enter` | Baris baru di input |
| `Ctrl/Cmd + Enter` | Terapkan custom instructions |
| `Escape` | Tutup dropdown header (model, thinking, menu "…") |

## Terminal interaktif (PTY)

Berperilaku seperti Windows Terminal — `Ctrl+C` tetap mengirim interrupt ke shell selama tidak ada teks terseleksi.

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + V` atau `Shift + Insert` | Paste isi clipboard ke shell |
| `Ctrl/Cmd + C` | Interrupt (`ETX`) bila **tidak** ada seleksi; **copy** bila ada seleksi |
| `Ctrl/Cmd + Shift + C` atau `Ctrl + Insert` | Selalu copy seleksi |
| `↑` / `↓` | Riwayat command shell |

## Command palette

| Shortcut | Action |
|----------|--------|
| `↑` / `↓` | Navigasi item |
| `Enter` | Jalankan item terpilih |
| `Escape` | Tutup palette |

## Catatan Aksesibilitas

- Semua elemen interaktif mendukung navigasi keyboard (`Tab` / `Shift + Tab`).
- Modal menerapkan focus management; tombol icon-only memiliki ARIA label.
- Kontras warna mengikuti WCAG AA; animasi menghormati `prefers-reduced-motion`.
