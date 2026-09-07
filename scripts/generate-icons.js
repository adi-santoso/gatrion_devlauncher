/**
 * DevLauncher app icon generator — zero dependencies (Node + zlib only).
 *
 * Renders the workspace-grid mark: three project tiles and one launch tile,
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

const PROJECT_TOP = hexToRgb('#786BFF');
const PROJECT_BOTTOM = hexToRgb('#5B45E8');
const LAUNCH_TOP = hexToRgb('#20E0E8');
const LAUNCH_BOTTOM = hexToRgb('#0BC4D4');

function gradientColor(top, bottom, t) {
  return top.map((channel, index) => Math.round(channel + (bottom[index] - channel) * t));
}

function insideRoundedRect(x, y, cx, cy, halfWidth, halfHeight, radius) {
  const qx = Math.abs(x - cx) - (halfWidth - radius);
  const qy = Math.abs(y - cy) - (halfHeight - radius);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) <= radius;
}

function insideTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const sign = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = sign(px, py, ax, ay, bx, by);
  const d2 = sign(px, py, bx, by, cx, cy);
  const d3 = sign(px, py, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

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

      const padding = 0.125;
      const gap = 0.035;
      const cell = (1 - padding * 2 - gap) / 2;
      const radius = cell * 0.22;
      const left = padding;
      const right = padding + cell + gap;
      const top = padding;
      const bottom = padding + cell + gap;
      const half = cell / 2;

      const inProjectTile =
        insideRoundedRect(u, v, left + half, top + half, half, half, radius) ||
        insideRoundedRect(u, v, right + half, top + half, half, half, radius) ||
        insideRoundedRect(u, v, left + half, bottom + half, half, half, radius);

      // The launch tile occupies the fourth grid cell. A short rounded body
      // keeps it visually related to the project tiles; the triangle gives it
      // forward motion without relying on a letter or interior glyph.
      const launchBody = insideRoundedRect(
        u,
        v,
        right + cell * 0.22,
        bottom + half,
        cell * 0.22,
        half,
        radius,
      );
      const launchWedge = insideTriangle(
        u,
        v,
        right + cell * 0.16,
        bottom,
        right + cell,
        bottom + half,
        right + cell * 0.16,
        bottom + cell,
      );
      const inLaunchTile = launchBody || launchWedge;

      if (!inProjectTile && !inLaunchTile) continue;

      const localT = inLaunchTile
        ? Math.min(1, Math.max(0, (v - bottom) / cell))
        : Math.min(1, Math.max(0, (v - top) / (cell * 2 + gap)));
      const color = inLaunchTile
        ? gradientColor(LAUNCH_TOP, LAUNCH_BOTTOM, localT)
        : gradientColor(PROJECT_TOP, PROJECT_BOTTOM, localT);

      const idx = (py * S + px) * 4;
      rgba[idx] = color[0];
      rgba[idx + 1] = color[1];
      rgba[idx + 2] = color[2];
      rgba[idx + 3] = 255;
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
