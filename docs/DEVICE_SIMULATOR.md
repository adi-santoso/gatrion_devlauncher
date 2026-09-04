# Device Simulator (Preview)

Simulator perangkat untuk **embedded preview** di Project Detail — cara cepat menguji
responsiveness tampilan (media query, breakpoint, layout) tanpa membuka DevTools atau
mengubah ukuran window aplikasi.

## Cara pakai

1. Buka project → tab **Preview** (mode normal atau fullscreen).
2. Di address bar, buka dropdown **Device** lalu pilih preset:
   - **iPhone SE / 14 Pro** (portrait)
   - **Android** (Pixel 7)
   - **iPad** / **iPad Pro**
   - **Laptop** (mis. 1440×900)
   - **Custom** — masukkan lebar × tinggi sendiri lalu tekan **Apply**
3. Tombol **rotate** (⟳) menukar orientasi landscape ⇄ portrait.
4. Pilih **Fit** untuk kembali ke mode viewport penuh.

Pilihan device tersimpan **per project** (localStorage), jadi berpindah project tidak
mereset pilihan.

## Cara kerja

Dua lapisan, keduanya aktif:

### 1. Resize viewport (inti)

Preview dirender sebagai `WebContentsView` native (bukan iframe). Memilih device membuat
view di-resize ke ukuran layar perangkat (CSS px) dan diposisikan di tengah **bezel**
perangkat di layar — media query dan breakpoint merespons viewport sungguhan, persis
seperti di perangkat nyata. Mekanisme ini memakai channel `preview-set-bounds` yang sudah
ada (tidak ada IPC baru): posisi diukur dari div layar perangkat, sehingga view selalu
menutupi layar secara pixel-perfect.

Bila window lebih kecil dari perangkat, **lebar perangkat dipertahankan** dan tinggi
di-clamp ke ruang yang tersedia — lebar adalah dimensi yang menentukan untuk testing
responsiveness, dan viewport tidak pernah didistorsi.

### 2. Emulasi CDP (fidelity)

Satu channel IPC baru `preview-set-device` memakai Chrome DevTools Protocol pada
`webContents` view:

- `setDeviceMetricsOverride` — ukuran viewport + `devicePixelRatio` perangkat
- emulasi **touch** (tap tanpa hover)
- override **user-agent** (hanya untuk preset mobile)

Ini komposisi yang sama dengan Device Mode di Chrome DevTools. Selama emulasi aktif,
tombol **DevTools** disembunyikan (debugger CDP dan DevTools tidak bisa dipakai
bersamaan), dan emulasi dibersihkan saat view di-destroy atau app quit.

## Arsitektur

| Layer | File | Peran |
|---|---|---|
| Preset + helper murni | `src/components/ProjectDetail/devicePresets.ts` | `DEVICE_PRESETS`, ukuran efektif (orientasi), clamp custom, persistensi localStorage |
| Hook state | `src/components/ProjectDetail/usePreviewDevice.ts` | `{ device, landscape, setDevice, toggleLandscape, size }` + persistensi per project |
| UI (dipakai di bar normal & fullscreen) | `src/components/ProjectDetail/PreviewDeviceBar.tsx` | dropdown device, rotate, input custom W×H, badge dimensi |
| Integrasi view | `src/components/ProjectDetail/AppPreviewTab.tsx` | bezel, pengukuran bounds, kirim `previewSetBounds` |
| CDP emulation (main) | `electron/managers/previewDeviceEmulation.ts` | attach/detach debugger, metrics + touch + UA |
| Delegasi | `electron/managers/PreviewManager.ts` | `setDevice()`/`clearDevice()` |
| IPC | `electron/handlers/previewHandlers.ts` + `ipcValidation.ts` + `preload.ts` + `src/data/preview.ts` | channel `preview-set-device` |

## Keterbatasan

- Tinggi view di-clamp saat window tidak cukup tinggi; lebar selalu akurat.
- Emulasi CDP hanya berlaku untuk view preview (bukan browser eksternal).
- Rotate memakai ukuran perangkat yang sudah ditentukan (bukan bebas).