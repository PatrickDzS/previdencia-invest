import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'icons');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function lerp(a, b, t) { return a + (b - a) * t; }

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Icono "trending-up" (lucide), coordenadas normalizadas (0..1, y p/ baixo)
const TREND_SEGMENTS = [
  [0.083, 0.708, 0.354, 0.438],
  [0.354, 0.438, 0.563, 0.646],
  [0.563, 0.646, 0.917, 0.292],
  [0.667, 0.292, 0.917, 0.292],
  [0.917, 0.292, 0.917, 0.542]
];

const TOP_COLOR = [52, 211, 153];   // emerald-400
const BOTTOM_COLOR = [13, 148, 136]; // teal-600

function drawIcon(size, opts) {
  const { scale = 1, halfWidth = Math.max(2.5, 0.045 * size) } = opts || {};
  const rgba = Buffer.alloc(size * size * 4);
  const inset = (1 - scale) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const g = (x + y) / (2 * (size - 1));
      rgba[i] = Math.round(lerp(TOP_COLOR[0], BOTTOM_COLOR[0], g));
      rgba[i + 1] = Math.round(lerp(TOP_COLOR[1], BOTTOM_COLOR[1], g));
      rgba[i + 2] = Math.round(lerp(TOP_COLOR[2], BOTTOM_COLOR[2], g));
      rgba[i + 3] = 255;

      const nx = inset + (x / (size - 1)) * scale;
      const ny = inset + (y / (size - 1)) * scale;
      let minD = Infinity;
      for (const s of TREND_SEGMENTS) {
        minD = Math.min(minD, distToSegment(nx, ny, s[0], s[1], s[2], s[3]));
      }
      const edge = halfWidth / size;
      if (minD <= edge) {
        const aa = Math.max(0, Math.min(1, (edge - minD) * (size / 2) + 0.5));
        rgba[i] = 255; rgba[i + 1] = 255; rgba[i + 2] = 255;
        rgba[i + 3] = Math.round(lerp(rgba[i + 3], 255, aa));
      }
    }
  }
  return encodePNG(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512, opts: { scale: 0.72, halfWidth: Math.max(3, 0.04 * 512) } },
  { file: 'apple-touch-icon-180.png', size: 180 }
];

for (const t of targets) {
  const png = drawIcon(t.size, t.opts);
  const out = join(OUT_DIR, t.file);
  writeFileSync(out, png);
  console.log(`Gerado: ${t.file} (${t.size}x${t.size}, ${png.length} bytes)`);
}