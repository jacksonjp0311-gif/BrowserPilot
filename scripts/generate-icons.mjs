import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

// Tiny PNG writer (RGBA) with CRC32

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function writePngRGBA(outPath, w, h, rgbaBytes) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Add filter byte 0 at start of each row
  const stride = w * 4;
  const raw = Buffer.alloc(h * (1 + stride));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + stride)] = 0;
    rgbaBytes.copy(raw, y * (1 + stride) + 1, y * stride, y * stride + stride);
  }

  const idatData = zlib.deflateSync(raw, { level: 9 });

  const png = Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0))
  ]);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, png);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function makeIconRGBA(size) {
  const w = size;
  const h = size;
  const buf = Buffer.alloc(w * h * 4);

  // AGNT palette-ish
  const c0 = { r: 229, g: 61, b: 143 }; // pink
  const c1 = { r: 18, g: 224, b: 255 }; // cyan
  const c2 = { r: 25, g: 239, b: 131 }; // green

  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const R = Math.min(w, h) * 0.42;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;

      // diagonal gradient
      const t = (x + y) / (w + h - 2);
      const r = Math.round(lerp(c0.r, c1.r, t));
      const g = Math.round(lerp(c0.g, c1.g, t));
      const b = Math.round(lerp(c0.b, c1.b, t));

      // vignette
      const dx = (x - cx) / (w * 0.5);
      const dy = (y - cy) / (h * 0.5);
      const v = clamp01(1 - 0.75 * Math.sqrt(dx * dx + dy * dy));

      // central lens ring
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const ring = Math.exp(-((dist - R) ** 2) / (2 * (R * 0.18) ** 2));

      // neon core
      const core = Math.exp(-(dist ** 2) / (2 * (R * 0.55) ** 2));

      // mix to green core slightly
      const mix = clamp01(core * 0.45 + ring * 0.35);

      const rr = Math.round(lerp(r * v, c2.r, mix));
      const gg = Math.round(lerp(g * v, c2.g, mix));
      const bb = Math.round(lerp(b * v, c2.b, mix));

      // subtle alpha for rounded corners (superellipse)
      const nx = (x - cx) / cx;
      const ny = (y - cy) / cy;
      const p = 4;
      const se = (Math.abs(nx) ** p + Math.abs(ny) ** p) ** (1 / p);
      const a = se <= 1 ? 255 : 0;

      buf[i + 0] = rr;
      buf[i + 1] = gg;
      buf[i + 2] = bb;
      buf[i + 3] = a;
    }
  }

  return buf;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const targets = [
    path.join(root, 'apps', 'edge-extension', 'assets', 'icons'),
    path.join(root, 'apps', 'chrome-extension', 'assets', 'icons')
  ];

  const sizes = [16, 32, 48, 128];

  for (const dir of targets) {
    for (const s of sizes) {
      const out = path.join(dir, `icon${s}.png`);
      const rgba = makeIconRGBA(s);
      writePngRGBA(out, s, s, rgba);
      console.log('wrote', out);
    }
  }
}

main();
