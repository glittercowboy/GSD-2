import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const addonDir = path.resolve(__dirname, "..", "..", "..", "..", "native", "addon");
const platformTag = `${process.platform}-${process.arch}`;
const candidates = [
  path.join(addonDir, `gsd_engine.${platformTag}.node`),
  path.join(addonDir, "gsd_engine.dev.node"),
];

let native;
for (const candidate of candidates) {
  try {
    native = require(candidate);
    break;
  } catch {
    // try next
  }
}

if (!native) {
  console.error("Native addon not found. Run 'npm run build:native -w @gsd/native' first.");
  process.exit(1);
}

function crc32(buf) {
  let crc = 0xffffffff;
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function createTestPng() {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(2, 0);
  ihdrData.writeUInt32BE(2, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  const ihdrType = Buffer.from("IHDR");
  const ihdrCrc = Buffer.alloc(4);
  ihdrCrc.writeUInt32BE(crc32(Buffer.concat([ihdrType, ihdrData])));
  const ihdr = Buffer.concat([Buffer.from([0, 0, 0, 13]), ihdrType, ihdrData, ihdrCrc]);

  const raw = Buffer.from([
    0, 255, 0, 0, 255, 0, 0,
    0, 255, 0, 0, 255, 0, 0,
  ]);
  const compressed = deflateSync(raw);
  const idatType = Buffer.from("IDAT");
  const idatLen = Buffer.alloc(4);
  idatLen.writeUInt32BE(compressed.length);
  const idatCrc = Buffer.alloc(4);
  idatCrc.writeUInt32BE(crc32(Buffer.concat([idatType, compressed])));
  const idat = Buffer.concat([idatLen, idatType, compressed, idatCrc]);

  const iendType = Buffer.from("IEND");
  const iendCrc = Buffer.alloc(4);
  iendCrc.writeUInt32BE(crc32(iendType));
  const iend = Buffer.concat([Buffer.from([0, 0, 0, 0]), iendType, iendCrc]);

  return Buffer.concat([signature, ihdr, idat, iend]);
}

const NativeImage = native.NativeImage;

describe("native image: NativeImage", () => {
  test("NativeImage class exists with parse method", () => {
    assert.ok(NativeImage, "NativeImage should be exported");
    assert.equal(typeof NativeImage.parse, "function");
  });

  test("parse decodes PNG with correct dimensions", async () => {
    const img = await NativeImage.parse(createTestPng());
    assert.equal(img.width, 2);
    assert.equal(img.height, 2);
  });

  test("encode to PNG produces valid PNG", async () => {
    const img = await NativeImage.parse(createTestPng());
    const encoded = await img.encode(0, 100);
    assert.ok(encoded.length > 0);
    assert.equal(encoded[0], 0x89);
    assert.equal(encoded[1], 0x50);
    assert.equal(encoded[2], 0x4e);
    assert.equal(encoded[3], 0x47);
  });

  test("encode to JPEG produces valid JPEG", async () => {
    const img = await NativeImage.parse(createTestPng());
    const encoded = await img.encode(1, 80);
    assert.ok(encoded.length > 0);
    assert.equal(encoded[0], 0xff);
    assert.equal(encoded[1], 0xd8);
  });

  test("resize returns correct dimensions", async () => {
    const img = await NativeImage.parse(createTestPng());
    const resized = await img.resize(10, 20, 5);
    assert.equal(resized.width, 10);
    assert.equal(resized.height, 20);
  });

  test("resize + encode round-trip", async () => {
    const img = await NativeImage.parse(createTestPng());
    const resized = await img.resize(4, 4, 1);
    const encoded = await resized.encode(0, 100);
    assert.ok(encoded.length > 0);
    const reparsed = await NativeImage.parse(new Uint8Array(encoded));
    assert.equal(reparsed.width, 4);
    assert.equal(reparsed.height, 4);
  });

  test("rejects invalid image data", async () => {
    await assert.rejects(
      () => NativeImage.parse(new Uint8Array([0, 1, 2, 3, 4, 5])),
      /Failed to (detect|decode) image/,
    );
  });

  test("rejects invalid format number", async () => {
    const img = await NativeImage.parse(createTestPng());
    await assert.rejects(() => img.encode(99, 100), /Invalid image format/);
  });
});
