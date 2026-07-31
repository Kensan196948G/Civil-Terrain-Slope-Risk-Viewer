import { deflateSync } from "node:zlib";

/**
 * E2E 用の 256×256 均一標高 GSI DEM タイルを実行時生成する。
 *
 * tests/fixtures/dem/*.png は 8×8 の golden データ (数値検証用) であり、実 GSI
 * タイルの寸法契約 (256×256) を満たさない。分析サンプラー (elevation-sampler)
 * は実タイルのピクセル座標 (0..255) を直接参照するため、8×8 fixture を
 * 差し替えに使うと画素参照が範囲外になる (Issue #33 の E2E 初回失敗の原因)。
 *
 * PNG は RGB 8bit・filter 0・zlib deflate の最小構成で自己完結に組み立てる
 * (依存なし)。標高エンコードは設計仕様 8.2 (x = e / 0.01, RGB ビッグエンディアン)。
 */

const CRC_TABLE = new Uint32Array(256).map((_unused, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

/** 均一標高の 256×256 GSI DEM タイル PNG (設計仕様 8.2 エンコード)。 */
export function buildUniformDemTilePng(elevationM: number, size = 256): Buffer {
  let x = Math.round(elevationM / 0.01);
  if (x < 0) {
    x += 2 ** 24;
  }
  const r = (x >> 16) & 0xff;
  const g = (x >> 8) & 0xff;
  const b = x & 0xff;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  // compression(10) / filter(11) / interlace(12) = 0

  const row = Buffer.alloc(1 + size * 3); // 先頭 1 byte は filter type 0
  for (let i = 0; i < size; i++) {
    row[1 + i * 3] = r;
    row[2 + i * 3] = g;
    row[3 + i * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}
