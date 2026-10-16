// The open-sesame animation: a brick wall with a round vault door. The handle spins and the bolts
// retract, the door swings open on its hinge revealing a golden glow, and the camera zooms through.
//
// Pure: (time, size) -> lines of ANSI-colored "▀" half blocks (two pixels per cell, roughly square).
// Coordinates are in scene units: 1 = half the viewport's smaller side, origin at the center.

export const DURATION = 2200;

export type ColorDepth = "truecolor" | "256";

type Rgb = readonly [number, number, number];

const R = 0.62; // door radius
/** Outer radius of the steel frame, in scene units. */
export const FRAME = R * 1.2;
const BOLTS = 10;
const RIVETS = 16;

const GOLD: Rgb = [255, 196, 84];
const GLOW: Rgb = [255, 236, 170];
const MORTAR: Rgb = [58, 52, 48];

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeIn = (t: number) => t * t * t;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
const gray = (v: number): Rgb => [v, v, v + 6];

/** Deterministic per-brick noise in [0, 1). */
const hash = (a: number, b: number) => {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

/** Distance from point p to segment a-b. */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

interface Pose {
  /** Handle rotation, radians. */
  spin: number;
  /** 0 = bolts out, 1 = retracted. */
  bolts: number;
  /** 0 = closed, 1 = fully open. */
  open: number;
  zoom: number;
  /** Fade to glow at the very end. */
  fade: number;
}

export function pose(t: number): Pose {
  const unlock = easeInOut(clamp(t / 700));
  return {
    spin: unlock * Math.PI * 1.5,
    bolts: easeInOut(clamp((t - 250) / 400)),
    open: easeInOut(clamp((t - 650) / 650)),
    zoom: 1 + easeIn(clamp((t - 1150) / 800)) * 5,
    fade: clamp((t - 1850) / 300),
  };
}

function wall(x: number, y: number): Rgb {
  const bh = 0.2;
  const bw = 0.44;
  const m = 0.05;
  const row = Math.floor(y / bh);
  const offset = (row & 1) * (bw / 2);
  const col = Math.floor((x + offset) / bw);
  const u = x + offset - col * bw;
  const v = y - row * bh;
  // Spotlight on the door: the wall darkens away from the center.
  const light = 1 - 0.55 * clamp(Math.hypot(x, y) / 2.4);
  if (u < m || v < m) return scale(MORTAR, light);
  const n = hash(row, col);
  const brick: Rgb = [138 + n * 40, 62 + n * 18, 44 + n * 12];
  // Slight bevel: top-left edge of each brick catches the light.
  const bevel = u < m * 2 || v < m * 2 ? 1.12 : 1;
  return scale(brick, light * bevel);
}

function frame(x: number, y: number, r: number): Rgb {
  const angle = Math.atan2(y, x);
  // Bevel: lit from the top-left.
  const lit = 0.5 + 0.5 * Math.cos(angle + Math.PI * 0.75);
  let c = gray(78 + lit * 70);
  const mid = (R + FRAME) / 2;
  for (let i = 0; i < RIVETS; i++) {
    const a = (i / RIVETS) * Math.PI * 2;
    if (Math.hypot(x - Math.cos(a) * mid, y - Math.sin(a) * mid) < 0.028) c = gray(190);
  }
  // Dark inner lip where the door seats.
  if (r < R + 0.02) c = gray(40);
  return c;
}

function door(x: number, y: number, p: Pose): Rgb {
  const r = Math.hypot(x, y);
  const angle = Math.atan2(y, x);
  // Brushed steel, lit from the top-left.
  let c = gray(118 + 52 * clamp(0.5 - (x + y) / (2.4 * R)) - 30 * (r / R));

  // Concentric groove.
  if (Math.abs(r - R * 0.74) < 0.022) c = gray(70);

  // Locking bolts around the rim, sliding inward when unlocked.
  const outer = R * (0.985 - 0.13 * p.bolts);
  for (let i = 0; i < BOLTS; i++) {
    const a = (i / BOLTS) * Math.PI * 2;
    const da = Math.abs(Math.atan2(Math.sin(angle - a), Math.cos(angle - a)));
    if (da * r < 0.035 && r > R * 0.82 && r < outer) c = gray(205);
  }

  // Handle: three spokes with gold knobs, rotating.
  for (let i = 0; i < 3; i++) {
    const a = p.spin + (i / 3) * Math.PI * 2;
    const ex = Math.cos(a) * R * 0.5;
    const ey = Math.sin(a) * R * 0.5;
    if (Math.hypot(x - ex, y - ey) < 0.055) return GOLD;
    if (segmentDistance(x, y, 0, 0, ex, ey) < 0.03) c = gray(215);
  }
  if (r < R * 0.15) c = r < R * 0.07 ? GOLD : gray(190);
  return c;
}

function interior(r: number, p: Pose): Rgb {
  // Treasure glow, brightening as the door opens.
  const glow = clamp(1 - r / R) ** 0.6;
  return mix([24, 16, 10], mix(GOLD, GLOW, glow), glow * (0.25 + 0.75 * p.open));
}

/** Color of the scene at (x, y). */
export function shade(x: number, y: number, p: Pose): Rgb {
  const r = Math.hypot(x, y);
  if (r > FRAME) return wall(x, y);
  if (r > R) return frame(x, y, r);

  // The door swings on a vertical hinge at x = -R: project back into door space.
  const squash = Math.cos(p.open * Math.PI * 0.47);
  const dx = (x + R) / squash - R;
  if (Math.hypot(dx, y) <= R) return scale(door(dx, y, p), 0.55 + 0.45 * squash);
  return interior(r, p);
}

function sgr(fg: Rgb, bg: Rgb, depth: ColorDepth): string {
  if (depth === "truecolor") {
    const [fr, fgr, fb] = fg.map((v) => Math.round(clamp(v, 0, 255)));
    const [br, bgr, bb] = bg.map((v) => Math.round(clamp(v, 0, 255)));
    return `\x1b[38;2;${fr};${fgr};${fb};48;2;${br};${bgr};${bb}m`;
  }
  const idx = (c: Rgb) => 16 + c.map((v) => Math.round((clamp(v, 0, 255) / 255) * 5)).reduce((acc, v) => acc * 6 + v, 0);
  return `\x1b[38;5;${idx(fg)};48;5;${idx(bg)}m`;
}

/** Render one frame: `rows` lines, each exactly `width` cells wide. */
export function renderFrame(t: number, width: number, rows: number, depth: ColorDepth = "truecolor"): string[] {
  const p = pose(t);
  const height = rows * 2;
  const unit = Math.min(width, height) / 2;
  const pixel = (px: number, py: number): Rgb => {
    const x = (px + 0.5 - width / 2) / (unit * p.zoom);
    const y = (py + 0.5 - height / 2) / (unit * p.zoom);
    return mix(shade(x, y, p), GLOW, p.fade);
  };

  const lines: string[] = [];
  for (let row = 0; row < rows; row++) {
    let line = "";
    let last = "";
    for (let col = 0; col < width; col++) {
      const code = sgr(pixel(col, row * 2), pixel(col, row * 2 + 1), depth);
      if (code !== last) line += code;
      last = code;
      line += "▀";
    }
    lines.push(`${line}\x1b[0m`);
  }
  return lines;
}

export function colorDepth(env: NodeJS.ProcessEnv = process.env): ColorDepth {
  return /truecolor|24bit/i.test(env.COLORTERM ?? "") ? "truecolor" : "256";
}
