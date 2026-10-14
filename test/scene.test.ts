import { describe, expect, test } from "bun:test";
import { DURATION, pose, renderFrame, shade } from "../src/ui/vault/scene";

const visible = (line: string) => Bun.stripANSI(line);

describe("vault scene", () => {
  test("frames have the requested size", () => {
    for (const t of [0, 800, 1500, DURATION]) {
      const lines = renderFrame(t, 40, 12);
      expect(lines).toHaveLength(12);
      for (const line of lines) expect(visible(line)).toBe("▀".repeat(40));
    }
  });

  test("256-color mode", () => {
    expect(renderFrame(0, 10, 3, "256")[0]).toContain("\x1b[38;5;");
  });

  test("timeline: unlock, open, zoom, fade", () => {
    expect(pose(0)).toMatchObject({ spin: 0, bolts: 0, open: 0, zoom: 1, fade: 0 });
    const end = pose(DURATION);
    expect(end.open).toBe(1);
    expect(end.zoom).toBeGreaterThan(5);
    expect(end.fade).toBe(1);
  });

  test("closed door is steel at the center, open vault glows gold", () => {
    const [r, g, b] = shade(0.2, 0.2, pose(0));
    expect(Math.abs(r - b)).toBeLessThan(20);
    const [gr, gg, gb] = shade(0.1, 0.1, pose(1500));
    expect(gr).toBeGreaterThan(gb + 60);
    expect(gg).toBeGreaterThan(gb);
  });

  test("deterministic", () => {
    expect(renderFrame(1234, 30, 8)).toEqual(renderFrame(1234, 30, 8));
  });
});
