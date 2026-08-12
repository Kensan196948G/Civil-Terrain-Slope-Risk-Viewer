/* global console */
/**
 * PWA アイコン生成 (Node.js 標準ライブラリのみ)。
 *
 * public/favicon.svg と同じブランドマーク (accent 角丸 + 白い山マーク) を
 * ラスタライズし、manifest 用 PNG を生成する。外部依存なしで CI/ローカル再現可。
 *
 * 使い方: node scripts/generate-pwa-icons.mjs
 */

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Buffer } from "node:buffer";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "apps", "web", "public");

/** 24x24 座標系の線分 (favicon.svg の stroke パスをそのまま移植)。 */
const SEGMENTS = [
  [3, 21, 21, 21],
  [5, 21, 5, 7],
  [5, 7, 13, 3],
  [13, 3, 13, 21],
  [19, 21, 19, 11],
  [19, 11, 13, 7],
];
const STROKE = 2.2;
const RADIUS = 5.5;
const ACCENT = [224, 138, 43];
const WHITE = [255, 255, 255];

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function roundedRectAlpha(x, y, size, radius) {
  // 角丸矩形の内外判定 (境界からの距離を返す。内側は負値)。
  const cx = Math.max(radius, Math.min(size - radius, x));
  const cy = Math.max(radius, Math.min(size - radius, y));
  return Math.hypot(x - cx, y - cy) - radius;
}

function render(size) {
  const scale = size / 24;
  const strokeWidth = STROKE * scale;
  const halfStroke = strokeWidth / 2;
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / scale;
      const py = (y + 0.5) / scale;
      const edge = roundedRectAlpha(px, py, 24, RADIUS);
      const backgroundAlpha = edge <= 0 ? 1 : Math.max(0, 1 - edge);
      let minDist = Number.POSITIVE_INFINITY;
      for (const [x1, y1, x2, y2] of SEGMENTS) {
        minDist = Math.min(minDist, distToSegment(px, py, x1, y1, x2, y2));
      }
      const strokeAlpha = Math.max(0, Math.min(1, halfStroke + 0.5 - minDist));

      let r = ACCENT[0];
      let g = ACCENT[1];
      let b = ACCENT[2];
      let a = backgroundAlpha;
      if (strokeAlpha > 0) {
        r = WHITE[0];
        g = WHITE[1];
        b = WHITE[2];
        a = Math.min(1, backgroundAlpha + (1 - backgroundAlpha) * strokeAlpha);
      }

      const offset = (y * size + x) * 4;
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
      pixels[offset + 3] = Math.round(a * 255);
    }
  }
  return pixels;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  const png = encodePng(size, render(size));
  const target = join(outDir, `icon-${size}.png`);
  writeFileSync(target, png);
  console.error(`generated ${target} (${png.length} bytes)`);
}
