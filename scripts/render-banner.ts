// Renders a still of the open-sesame animation as the README banner: bun run render:banner
// Chunky pixels to match the terminal look. Writes .github/assets/banner.png.
import { deflateSync } from "node:zlib";
import { pose, shade } from "../src/ui/vault/scene";

const WIDTH = 1280;
const HEIGHT = 400;
const PIXEL = 5;
const T = 1120; // ms into the animation: bolts retracted, door swung open, glow showing

const cols = WIDTH / PIXEL;
const rows = HEIGHT / PIXEL;
const p = pose(T);
const unit = Math.min(cols, rows) / 2 / 0.86; // fit the frame with a little wall around it

const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
for (let y = 0; y < HEIGHT; y++) {
  const line = y * (WIDTH * 3 + 1);
  raw[line] = 0; // filter: none
  const py = Math.floor(y / PIXEL);
  for (let x = 0; x < WIDTH; x++) {
    const px = Math.floor(x / PIXEL);
    const [r, g, b] = shade((px + 0.5 - cols / 2) / unit, (py + 0.5 - rows / 2) / unit, p);
    raw.set([r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v)))), line + 1 + x * 3);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
};

const header = Buffer.alloc(13);
header.writeUInt32BE(WIDTH, 0);
header.writeUInt32BE(HEIGHT, 4);
header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
await Bun.write(".github/assets/banner.png", png);
console.log(`wrote .github/assets/banner.png (${(png.length / 1024).toFixed(0)} KB)`);
