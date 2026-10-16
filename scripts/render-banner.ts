// Renders stills of the open-sesame animation: bun run render:banner
// Chunky pixels to match the terminal look. Deterministic: same scene, same bytes.
//
// - .github/assets/banner.png  README banner
// - docs/public/vault.png       docs home hero (wall fades out around the door)
// - docs/public/og.png          social preview card
// - docs/public/logo.png        nav logo: just the door, ajar
// - docs/public/favicon.png     same, small
import { deflateSync } from "node:zlib";
import { FRAME, pose, shade } from "../src/ui/vault/scene";

const OPEN = 1120; // ms into the animation: bolts retracted, door swung open, glow showing
const AJAR = 1000; // door half open: a crescent of gold

interface Still {
  path: string;
  width: number;
  height: number;
  /** Output pixels per scene pixel. */
  pixel: number;
  /** Time into the animation, ms. */
  t: number;
  /** Scene units from the center to the nearest edge. */
  reach: number;
  /**
   * Alpha by distance from the center, in scene units: opaque inside `from`, transparent beyond `to`.
   * Omit for an opaque RGB image.
   */
  fade?: { from: number; to: number };
}

const stills: Still[] = [
  { path: ".github/assets/banner.png", width: 1280, height: 400, pixel: 5, t: OPEN, reach: 0.86 },
  { path: "docs/public/vault.png", width: 720, height: 720, pixel: 8, t: OPEN, reach: 1.25, fade: { from: FRAME + 0.12, to: 1.25 } },
  { path: "docs/public/og.png", width: 1200, height: 630, pixel: 6, t: OPEN, reach: 0.9 },
  { path: "docs/public/logo.png", width: 128, height: 128, pixel: 4, t: AJAR, reach: FRAME + 0.02, fade: { from: FRAME, to: FRAME } },
  { path: "docs/public/favicon.png", width: 64, height: 64, pixel: 2, t: AJAR, reach: FRAME + 0.02, fade: { from: FRAME, to: FRAME } },
];

function render({ width, height, pixel, t, reach, fade }: Still): Buffer {
  const cols = width / pixel;
  const rows = height / pixel;
  const p = pose(t);
  const unit = Math.min(cols, rows) / 2 / reach;
  const channels = fade ? 4 : 3;
  const stride = width * channels + 1;

  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    const py = Math.floor(y / pixel);
    for (let x = 0; x < width; x++) {
      const px = Math.floor(x / pixel);
      const sx = (px + 0.5 - cols / 2) / unit;
      const sy = (py + 0.5 - rows / 2) / unit;
      const rgb = shade(sx, sy, p).map((v) => Math.round(Math.min(255, Math.max(0, v))));
      if (fade) {
        const r = Math.hypot(sx, sy);
        const a = r <= fade.from ? 1 : r >= fade.to ? 0 : 1 - (r - fade.from) / (fade.to - fade.from);
        // Quantized to steps so the fade stays pixel-y.
        rgb.push(Math.round(Math.round(a * 4) / 4 * 255));
      }
      raw.set(rgb, y * stride + 1 + x * channels);
    }
  }
  return png(width, height, fade ? 6 : 2, raw);
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

/** colorType: 2 = RGB, 6 = RGBA (8 bits per channel). */
function png(width: number, height: number, colorType: 2 | 6, raw: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, colorType, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const still of stills) {
  const data = render(still);
  await Bun.write(still.path, data);
  console.log(`wrote ${still.path} (${(data.length / 1024).toFixed(0)} KB)`);
}
