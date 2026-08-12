/**
 * Gatrion app icon generator — zero dependencies (Node + zlib only).
 *
 * Renders a rounded-square purple gradient tile with a white "G" monogram,
 * then writes:
 *   - build/icon.png        (512x512, window icon)
 *   - build/icon.ico        (256x256 PNG-embedded ICO, Windows packaging)
 *   - build/icon-tray.png   (32x32, tray icon)
 *
 * Usage: node scripts/generate-icons.js
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'build');

// ---------------------------------------------------------------- PNG encoder
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- ICO encoder
function encodeICO(pngBuffer) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count
  const entry = Buffer.alloc(16);
  entry[0] = 0; // width (0 = 256)
  entry[1] = 0; // height (0 = 256)
  entry[2] = 0; // color count
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bit count
  entry.writeUInt32LE(pngBuffer.length, 8); // bytes in resource
  entry.writeUInt32LE(22, 12); // image offset
  return Buffer.concat([header, entry, pngBuffer]);
}

// ---------------------------------------------------------------- renderer
function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

const GRADIENT_TOP = hexToRgb('#7D6FFF');
const GRADIENT_BOTTOM = hexToRgb('#4E3ED8');
const GLYPH = hexToRgb('#FFFFFF');

// Glyph geometry (unit coordinates, center at 0.5/0.5)
const RING_OUTER = 0.335;
const RING_INNER = 0.19;
const GAP_HALF = 0.42; // radians of opening on the right side
const BAR_HALF_H = 0.0525;
const BAR_X1 = 0.40;
const BAR_X2 = 0.5 + RING_OUTER;
const BAR_CX = (BAR_X1 + BAR_X2) / 2;
const BAR_HALF_W = (BAR_X2 - BAR_X1) / 2;
const CORNER_RADIUS = 0.22;

/**
 * Render the icon at `size` px with `ss`x supersampling.
 * Returns an RGBA buffer (size*size*4).
 */
function renderIcon(size, ss = 4) {
  const S = size * ss;
  const rgba = Buffer.alloc(S * S * 4);

  for (let py = 0; py < S; py++) {
    const v = (py + 0.5) / S;
    for (let px = 0; px < S; px++) {
      const u = (px + 0.5) / S;

      // Rounded-square background mask
      const dx = Math.abs(u - 0.5);
      const dy = Math.abs(v - 0.5);
      const qx = dx - (0.5 - CORNER_RADIUS);
      const qy = dy - (0.5 - CORNER_RADIUS);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const rectDist = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - CORNER_RADIUS;
      if (rectDist > 0) continue; // outside the tile → transparent

      // Vertical gradient background
      const t = Math.min(1, Math.max(0, v));
      const r = GRADIENT_TOP[0] + (GRADIENT_BOTTOM[0] - GRADIENT_TOP[0]) * t;
      const g = GRADIENT_TOP[1] + (GRADIENT_BOTTOM[1] - GRADIENT_TOP[1]) * t;
      const b = GRADIENT_TOP[2] + (GRADIENT_BOTTOM[2] - GRADIENT_TOP[2]) * t;

      // "G" = ring with a gap on the right + middle bar
      const dist = Math.hypot(u - 0.5, v - 0.5);
      const ringMid = (RING_INNER + RING_OUTER) / 2;
      const inRing = Math.abs(dist - ringMid) <= (RING_OUTER - RING_INNER) / 2;
      const angle = Math.atan2(v - 0.5, u - 0.5);
      const inGap = Math.abs(angle) <= GAP_HALF;
      const inBar = Math.abs(u - BAR_CX) <= BAR_HALF_W && Math.abs(v - 0.5) <= BAR_HALF_H;
      const glyphOn = (inRing && !inGap) || inBar;

      const idx = (py * S + px) * 4;
      if (glyphOn) {
        rgba[idx] = GLYPH[0];
        rgba[idx + 1] = GLYPH[1];
        rgba[idx + 2] = GLYPH[2];
        rgba[idx + 3] = 255;
      } else {
        rgba[idx] = Math.round(r);
        rgba[idx + 1] = Math.round(g);
        rgba[idx + 2] = Math.round(b);
        rgba[idx + 3] = 255;
      }
    }
  }
  return downsamplePremultiplied(rgba, S, size);
}

/** Box-downsample with premultiplied alpha for smooth, transparent edges. */
function downsamplePremultiplied(src, S, size) {
  const ss = S / size;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let pr = 0, pg = 0, pb = 0, pa = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const idx = ((y * ss + sy) * S + (x * ss + sx)) * 4;
          const a = src[idx + 3];
          pr += src[idx] * a;
          pg += src[idx + 1] * a;
          pb += src[idx + 2] * a;
          pa += a;
        }
      }
      const idx = (y * size + x) * 4;
      if (pa === 0) {
        out[idx + 3] = 0;
      } else {
        const pixels = ss * ss;
        out[idx] = Math.round(pr / pa);
        out[idx + 1] = Math.round(pg / pa);
        out[idx + 2] = Math.round(pb / pa);
        out[idx + 3] = Math.round(pa / pixels);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- main
function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const png512 = encodePNG(512, 512, renderIcon(512));
  const png256 = encodePNG(256, 256, renderIcon(256));
  const png32 = encodePNG(32, 32, renderIcon(32));

  fs.writeFileSync(path.join(OUTPUT_DIR, 'icon.png'), png512);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'icon.ico'), encodeICO(png256));
  fs.writeFileSync(path.join(OUTPUT_DIR, 'icon-tray.png'), png32);

  console.log('Generated build/icon.png (512x512)');
  console.log('Generated build/icon.ico (256x256)');
  console.log('Generated build/icon-tray.png (32x32)');
}

main();
