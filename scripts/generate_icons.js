/**
 * scripts/generate_icons.js
 * สร้างไฟล์ภาพไอคอน PNG จริงสำหรับ PWA และ iOS Safari (192x192, 512x512, 180x180)
 * วาดกราฟิกรูปใบเสร็จพร้อมสัญลักษณ์ AI Sparkle ด้วย Pure Node.js (ไม่พึ่งพา Binary ภายนอก)
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ตาราง CRC32 มาตรฐานสำหรับ PNG Chunk
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([lenBuf, body, crcBuf]);
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function mixColor(bg, fg, alpha) {
  const a = clamp(alpha, 0, 1);
  return [
    Math.round(bg[0] * (1 - a) + fg[0] * a),
    Math.round(bg[1] * (1 - a) + fg[1] * a),
    Math.round(bg[2] * (1 - a) + fg[2] * a),
    255
  ];
}

function sdRoundedBox(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - halfW + r;
  const qy = Math.abs(py - cy) - halfH + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function renderIconPNG(size, isAppleTouch = false) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const scale = size;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * (size * 4 + 1);
    raw[rowOffset] = 0; // Filter type 0 (None)

    const ny = (y + 0.5) / scale;
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / scale;
      const aa = 1.5 / scale;

      // 1. พื้นหลังไล่เฉดสีเขียวอมฟ้า (Teal 800 -> Teal 600)
      const gradT = clamp((nx * 0.45 + ny * 0.55), 0, 1);
      const bgR = Math.round(13 * (1 - gradT) + 15 * gradT);
      const bgG = Math.round(148 * (1 - gradT) + 94 * gradT);
      const bgB = Math.round(136 * (1 - gradT) + 89 * gradT);
      let pixel = [bgR, bgG, bgB, 255];

      // ขอบมนสำหรับ PWA Icon (ส่วน Apple Touch Icon เต็มกรอบตามมาตรฐาน iOS)
      if (!isAppleTouch) {
        const dBg = sdRoundedBox(nx, ny, 0.5, 0.5, 0.46, 0.46, 0.18);
        if (dBg > aa) {
          const idx = rowOffset + 1 + x * 4;
          raw[idx] = 0;
          raw[idx + 1] = 0;
          raw[idx + 2] = 0;
          raw[idx + 3] = 0;
          continue;
        }
      }

      // 2. เงาใบเสร็จ
      const dShadow = sdRoundedBox(nx, ny, 0.48, 0.54, 0.25, 0.31, 0.04);
      if (dShadow < 0.04) {
        const sAlpha = clamp(1 - (dShadow + 0.01) / 0.05, 0, 1) * 0.28;
        pixel = mixColor(pixel, [4, 47, 46], sAlpha);
      }

      // 3. ตัวกระดาษใบเสร็จสีขาว พร้อมรอยหยักด้านล่าง
      const zigFreq = 6;
      const relX = clamp((nx - 0.23) / 0.50, 0, 1);
      const zigPhase = Math.abs((relX * zigFreq) % 1 - 0.5) * 2; // 0..1
      const bottomEdge = 0.81 - zigPhase * 0.032;

      const dPaper = sdRoundedBox(nx, ny, 0.47, 0.49, 0.24, 0.32, 0.035);
      if (dPaper < aa && ny < bottomEdge + aa) {
        const paperAlpha = clamp(0.5 - Math.max(dPaper, ny - bottomEdge) / aa, 0, 1);
        pixel = mixColor(pixel, [255, 255, 255], paperAlpha);

        // แถบหัวใบเสร็จสีเขียวมรกตอ่อน
        const dHeader = sdRoundedBox(nx, ny, 0.47, 0.265, 0.18, 0.032, 0.016);
        if (dHeader < aa) {
          const hAlpha = clamp(0.5 - dHeader / aa, 0, 1);
          pixel = mixColor(pixel, [15, 118, 110], hAlpha);
        }

        // เส้นรายการบนใบเสร็จ 3 บรรทัด
        const lines = [
          { y: 0.38, x1: 0.35, w: 0.11, color: [100, 116, 139] },
          { y: 0.38, x1: 0.58, w: 0.05, color: [15, 118, 110] },
          { y: 0.47, x1: 0.36, w: 0.12, color: [100, 116, 139] },
          { y: 0.47, x1: 0.58, w: 0.05, color: [15, 118, 110] },
          { y: 0.56, x1: 0.34, w: 0.09, color: [100, 116, 139] },
          { y: 0.56, x1: 0.58, w: 0.05, color: [15, 118, 110] },
          // แถบสรุปยอดรวมด้านล่าง
          { y: 0.67, x1: 0.47, w: 0.17, h: 0.024, color: [20, 184, 166] }
        ];

        for (const ln of lines) {
          const dLine = sdRoundedBox(nx, ny, ln.x1, ln.y, ln.w, ln.h || 0.013, 0.01);
          if (dLine < aa) {
            const lAlpha = clamp(0.5 - dLine / aa, 0, 1);
            pixel = mixColor(pixel, ln.color, lAlpha);
          }
        }
      }

      // 4. วงกลมสัญลักษณ์ AI Sparkle สีทองอำพันมุมขวาล่าง
      const badgeCx = 0.72;
      const badgeCy = 0.69;
      const badgeR = 0.165;
      const dBadge = Math.hypot(nx - badgeCx, ny - badgeCy) - badgeR;
      if (dBadge < aa) {
        const bAlpha = clamp(0.5 - dBadge / aa, 0, 1);
        pixel = mixColor(pixel, [245, 158, 11], bAlpha);

        // ขอบขาวรอบวงกลม AI
        const dRing = Math.abs(dBadge + 0.012) - 0.012;
        if (dRing < aa) {
          const rAlpha = clamp(0.5 - dRing / aa, 0, 1);
          pixel = mixColor(pixel, [255, 255, 255], rAlpha);
        }

        // ดาว 4 แฉก (AI Sparkle) ตรงกลางวงกลม
        const sx = Math.abs(nx - badgeCx) / 0.095;
        const sy = Math.abs(ny - badgeCy) / 0.095;
        const sparkleDist = (Math.pow(sx, 0.65) + Math.pow(sy, 0.65) - 1.0) * 0.095;
        if (sparkleDist < aa) {
          const spAlpha = clamp(0.5 - sparkleDist / aa, 0, 1);
          pixel = mixColor(pixel, [255, 255, 255], spAlpha);
        }
      }

      const idx = rowOffset + 1 + x * 4;
      raw[idx] = pixel[0];
      raw[idx + 1] = pixel[1];
      raw[idx + 2] = pixel[2];
      raw[idx + 3] = pixel[3];
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // Bit depth 8
  ihdr[9] = 6; // Color type 6 (RGBA)
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const iconsDir = path.join(rootDir, 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const targets = [
    { file: path.join(iconsDir, 'icon-192.png'), size: 192, apple: false },
    { file: path.join(iconsDir, 'icon-512.png'), size: 512, apple: false },
    { file: path.join(rootDir, 'apple-touch-icon.png'), size: 180, apple: true }
  ];

  for (const t of targets) {
    const buf = renderIconPNG(t.size, t.apple);
    fs.writeFileSync(t.file, buf);
    console.log(`Generated ${path.relative(rootDir, t.file)} (${t.size}x${t.size}, ${buf.length} bytes)`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { renderIconPNG };
