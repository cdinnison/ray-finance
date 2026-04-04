import { deflateSync } from "zlib";

/** Generate a minimal 4x4 solid-color PNG as base64 from a hex color string. */
export function colorPng(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk: 4x4, 8-bit RGB
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(4, 0);  // width
  ihdrData.writeUInt32BE(4, 4);  // height
  ihdrData[8] = 8;               // bit depth
  ihdrData[9] = 2;               // color type: RGB
  const ihdr = makeChunk("IHDR", ihdrData);

  // IDAT chunk: raw pixel data (filter byte 0 + 4 RGB pixels per row)
  const rowLen = 1 + 4 * 3; // filter byte + 4 pixels * 3 channels
  const raw = Buffer.alloc(rowLen * 4);
  for (let y = 0; y < 4; y++) {
    const offset = y * rowLen;
    raw[offset] = 0; // no filter
    for (let x = 0; x < 4; x++) {
      raw[offset + 1 + x * 3] = r;
      raw[offset + 2 + x * 3] = g;
      raw[offset + 3 + x * 3] = b;
    }
  }
  const compressed = deflateSync(raw);
  const idat = makeChunk("IDAT", compressed);

  // IEND chunk
  const iend = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]).toString("base64");
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput) >>> 0);
  return Buffer.concat([len, typeBuffer, data, crc]);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return c ^ 0xffffffff;
}

export const LOGOS = {
  chase: colorPng("#003087"),
  robinhood: colorPng("#00C805"),
  schwab: colorPng("#00A0DF"),
  amex: colorPng("#006FCF"),
};
