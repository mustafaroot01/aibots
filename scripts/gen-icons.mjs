/**
 * يولّد أيقونات التطبيق (PNG) بدون أي مكتبة خارجية — zlib المدمج بس.
 * تشغيل:  node scripts/gen-icons.mjs
 */
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

// ————— كاتب PNG بسيط —————
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ————— أدوات رسم —————
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const mix = (a, b, t) => a + (b - a) * t;

/** مسافة موقّعة لمستطيل بحواف دائرية */
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * يرسم أيقونة الحقيبة: خلفية متدرجة بحواف دائرية + حقيبة بيضاء.
 * padding = هامش المنطقة الآمنة (للأيقونة القابلة للقص maskable).
 */
function drawIcon(size, { padding = 0, radiusRatio = 0.22, full = false } = {}) {
  const SS = 3; // عينات فرعية للتنعيم
  const W = size, H = size;
  const out = Buffer.alloc(W * H * 4);

  const inset = size * padding;
  const bx = inset, by = inset, bw = size - inset * 2, bh = size - inset * 2;
  const bcx = bx + bw / 2, bcy = by + bh / 2;
  const bR = full ? bw / 2 : bw * radiusRatio;

  // الحقيبة داخل الخلفية
  const s = bw;
  const bodyW = s * 0.60, bodyH = s * 0.44;
  const bodyCx = bcx, bodyCy = bcy + s * 0.055;
  const bodyR = s * 0.075;
  const handleW = s * 0.26, handleH = s * 0.145;
  const handleCx = bcx, handleCy = bcy - s * 0.215;
  const handleR = s * 0.055;
  const handleT = s * 0.048; // سماكة المقبض

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;

          // الخلفية المتدرجة
          const dBg = sdRoundRect(px, py, bcx, bcy, bw / 2, bh / 2, bR);
          const bgA = clamp01(0.5 - dBg);
          if (bgA <= 0) continue;

          const t = clamp01(((px - bx) / bw) * 0.55 + ((py - by) / bh) * 0.65);
          let cr = mix(16, 6, t), cg = mix(163, 110, t), cb = mix(127, 86, t);

          // الحقيبة (أبيض)
          const dBody = sdRoundRect(px, py, bodyCx, bodyCy, bodyW / 2, bodyH / 2, bodyR);
          const dHandleOuter = sdRoundRect(px, py, handleCx, handleCy, handleW / 2, handleH / 2, handleR);
          const dHandleInner = sdRoundRect(px, py, handleCx, handleCy + handleT * 0.5,
            handleW / 2 - handleT, handleH / 2 - handleT * 0.5, Math.max(1, handleR - handleT));
          const handleA = Math.min(clamp01(0.5 - dHandleOuter), 1 - clamp01(0.5 - dHandleInner));

          // الشريط الأفقي والقفل
          const dStripe = sdRoundRect(px, py, bodyCx, bodyCy - bodyH * 0.10, bodyW / 2 + 2, s * 0.016, 0);
          const dClasp = sdRoundRect(px, py, bodyCx, bodyCy - bodyH * 0.10, s * 0.055, s * 0.042, s * 0.016);

          let whiteA = Math.max(clamp01(0.5 - dBody), handleA);
          const cutA = Math.max(clamp01(0.5 - dStripe) * 0.55, clamp01(0.5 - dClasp));
          whiteA = Math.max(0, whiteA - cutA * whiteA);

          cr = mix(cr, 255, whiteA);
          cg = mix(cg, 255, whiteA);
          cb = mix(cb, 255, whiteA);

          r += cr * bgA; g += cg * bgA; b += cb * bgA; a += bgA;
        }
      }

      const n = SS * SS;
      const i = (y * W + x) * 4;
      const alpha = a / n;
      out[i] = alpha > 0 ? Math.round(r / a) : 0;
      out[i + 1] = alpha > 0 ? Math.round(g / a) : 0;
      out[i + 2] = alpha > 0 ? Math.round(b / a) : 0;
      out[i + 3] = Math.round(alpha * 255);
    }
  }
  return encodePng(W, H, out);
}

const targets = [
  ["public/icons/icon-192.png", 192, {}],
  ["public/icons/icon-512.png", 512, {}],
  ["public/icons/maskable-512.png", 512, { padding: 0.11, radiusRatio: 0.5, full: true }],
  ["public/icons/apple-touch-icon.png", 180, { radiusRatio: 0.0001 }],
  ["src/app/icon.png", 64, {}],
];

for (const [file, size, opts] of targets) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, drawIcon(size, opts));
  console.log(`✓ ${file} (${size}×${size})`);
}
