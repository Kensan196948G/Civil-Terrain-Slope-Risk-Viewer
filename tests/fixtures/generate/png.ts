/**
 * Minimal, dependency-free PNG codec for golden DEM fixtures.
 *
 * Scope is intentionally narrow: 8-bit RGB (color type 2), no alpha, no
 * interlacing, filter type 0 on every scanline, single IDAT chunk. This is
 * exactly the shape of a GSI DEM elevation tile, and keeping the codec tiny
 * lets the fixtures round-trip through Node's standard `zlib` with no external
 * packages.
 *
 * The encoder is used by the fixture generator; the decoder is used by the
 * validation test to read the committed PNGs back and recover elevations via
 * `@civil-terrain/geo`'s `decodeElevation`. They are the two halves of one
 * round-trip, not duplicated logic.
 */

import { deflateSync, inflateSync } from "node:zlib";

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const BIT_DEPTH_8 = 8;
const COLOR_TYPE_RGB = 2;
const BYTES_PER_PIXEL = 3;

/** A decoded RGB raster: `pixels[y][x] = [r, g, b]`, each channel 0-255. */
export interface RgbRaster {
  readonly width: number;
  readonly height: number;
  /** Row-major, top-to-bottom. */
  readonly pixels: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>>;
}

const CRC_TABLE: readonly number[] = (() => {
  const table = new Array<number>(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u32be(value: number): Uint8Array {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Uint8Array.from([...type].map((ch) => ch.charCodeAt(0)));
  const typeAndData = concat([typeBytes, data]);
  return concat([u32be(data.length), typeAndData, u32be(crc32(typeAndData))]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Encode an RGB raster (`pixels[y][x] = [r, g, b]`) into PNG bytes.
 * Every scanline is written with filter type 0 (None) for deterministic output.
 */
export function encodePng(
  pixels: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>>,
): Uint8Array {
  const height = pixels.length;
  const width = height > 0 ? (pixels[0] as readonly (readonly number[])[]).length : 0;

  const ihdr = concat([
    u32be(width),
    u32be(height),
    Uint8Array.from([BIT_DEPTH_8, COLOR_TYPE_RGB, 0, 0, 0]),
  ]);

  const stride = width * BYTES_PER_PIXEL;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: None
    const row = pixels[y] as readonly (readonly [number, number, number])[];
    for (let x = 0; x < width; x++) {
      const [r, g, b] = row[x] as readonly [number, number, number];
      const px = rowStart + 1 + x * BYTES_PER_PIXEL;
      raw[px] = r & 0xff;
      raw[px + 1] = g & 0xff;
      raw[px + 2] = b & 0xff;
    }
  }

  const idat = new Uint8Array(deflateSync(raw));
  return concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

function readU32be(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] as number) << 24) |
      ((bytes[offset + 1] as number) << 16) |
      ((bytes[offset + 2] as number) << 8) |
      (bytes[offset + 3] as number)) >>>
    0
  );
}

/**
 * Decode PNG bytes produced by {@link encodePng} back into an RGB raster.
 * Only the narrow subset this codec emits is supported; anything else throws so
 * a malformed or unexpected fixture fails loudly instead of silently.
 */
export function decodePng(bytes: Uint8Array): RgbRaster {
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      throw new Error("Not a PNG (bad signature)");
    }
  }

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  const idatParts: Uint8Array[] = [];

  while (offset < bytes.length) {
    const length = readU32be(bytes, offset);
    const type = String.fromCharCode(
      bytes[offset + 4] as number,
      bytes[offset + 5] as number,
      bytes[offset + 6] as number,
      bytes[offset + 7] as number,
    );
    const dataStart = offset + 8;
    const data = bytes.subarray(dataStart, dataStart + length);

    if (type === "IHDR") {
      width = readU32be(data, 0);
      height = readU32be(data, 4);
      const bitDepth = data[8];
      const colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== BIT_DEPTH_8 || colorType !== COLOR_TYPE_RGB || interlace !== 0) {
        throw new Error(
          `Unsupported PNG: bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}`,
        );
      }
    } else if (type === "IDAT") {
      idatParts.push(Uint8Array.from(data));
    } else if (type === "IEND") {
      break;
    }

    offset = dataStart + length + 4; // skip data + CRC
  }

  const raw = new Uint8Array(inflateSync(concat(idatParts)));
  const stride = width * BYTES_PER_PIXEL;
  const pixels: [number, number, number][][] = [];
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    if (filter !== 0) {
      throw new Error(`Unsupported scanline filter ${filter} at row ${y}`);
    }
    const row: [number, number, number][] = [];
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * BYTES_PER_PIXEL;
      row.push([raw[px] as number, raw[px + 1] as number, raw[px + 2] as number]);
    }
    pixels.push(row);
  }

  return { width, height, pixels };
}
