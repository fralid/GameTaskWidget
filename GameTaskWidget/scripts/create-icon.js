/**
 * Creates a minimal 16x16 icon.ico for Tauri Windows build.
 * Run from project root: node scripts/create-icon.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const iconsDir = path.join(__dirname, '..', 'src-tauri', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// ICO: ICONDIR (6) + ICONDIRENTRY (16) + BITMAPINFOHEADER (40) + XOR (16*16*4) + AND mask (16*4)
const xorSize = 16 * 16 * 4;
const andRowBytes = Math.ceil(16 / 32) * 4;
const andSize = 16 * andRowBytes;
const imageSize = 40 + xorSize + andSize;

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);

const entry = Buffer.alloc(16);
entry[0] = 16;
entry[1] = 16;
entry[2] = 0;
entry[3] = 0;
entry[4] = 1;
entry[5] = 0;
entry[6] = 32;
entry[7] = 0;
entry.writeUInt32LE(imageSize, 8);
entry.writeUInt32LE(22, 12);

const bmi = Buffer.alloc(40);
bmi.writeUInt32LE(40, 0);
bmi.writeInt32LE(16, 4);
bmi.writeInt32LE(32, 8);
bmi.writeUInt16LE(1, 12);
bmi.writeUInt16LE(32, 14);
bmi.writeUInt32LE(0, 16);
bmi.writeUInt32LE(xorSize, 20);
for (let i = 24; i < 40; i++) bmi[i] = 0;

const pixels = Buffer.alloc(xorSize);
const b = 0xa8, g = 0x55, r = 0xf7, a = 0xff;
for (let i = 0; i < xorSize; i += 4) {
  pixels[i] = b;
  pixels[i + 1] = g;
  pixels[i + 2] = r;
  pixels[i + 3] = a;
}
const andMask = Buffer.alloc(andSize, 0);

const ico = Buffer.concat([header, entry, bmi, pixels, andMask]);
const icoPath = path.join(iconsDir, 'icon.ico');
fs.writeFileSync(icoPath, ico);
console.log('Created', icoPath);
