# Keyboard Shortcuts - DevLauncher

Daftar shortcut yang benar-benar terimplementasi di source. `Ctrl` berlaku untuk Windows/Linux, `Cmd` untuk macOS.

## Global (di mana saja)

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Shift + Space` | Panggil/fokus jendela aplikasi (OS global, dari aplikasi lain mana pun) |
| `Ctrl/Cmd + K` | Buka command palette |
| `Ctrl/Cmd + N` | Tambah project baru (buka ProjectModal) |
| `Ctrl + Shift + S` | Start semua project |
| `Ctrl + Shift + X` | Stop semua project |
| `Escape` | Tutup modal / palette yang sedang terbuka |
| `?` | Buka modal shortcuts |

## Projects view

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + A` | Pilih semua baris (bulk select) |
| `Escape` | Hapus seleksi (saat tidak sedang mengetik) |

## Project Detail — fullscreen preview

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + ←` / `Ctrl/Cmd + →` | Pindah ke project sebelumnya / berikutnya |
| `F12` atau `Ctrl + Shift + I` | Buka/tutup DevTools preview |

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
