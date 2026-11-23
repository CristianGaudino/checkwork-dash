import { describe, expect, it } from "vitest";
import { cropSize, frameCrop, turnedSize } from "./downscale";

describe("frameCrop", () => {
  it("fits the biggest frame of the shape, centred", () => {
    const { crop } = frameCrop(1600, 1200, 1, 1, 0.5, 0.5); // a square on a 4:3 photo
    expect(crop.width).toBeCloseTo(0.75);
    expect(crop.height).toBeCloseTo(1);
    expect(crop.x).toBeCloseTo(0.125);
    expect(crop.y).toBeCloseTo(0);
  });

  it("zooms in and stops at the edge", () => {
    const r = frameCrop(1000, 1000, 1, 2, 0, 1);
    expect(r.crop).toEqual({ x: 0, y: 0.5, width: 0.5, height: 0.5 });
    expect([r.cx, r.cy]).toEqual([0.25, 0.75]);
  });

  it("keeps 9:16 on a wide photo", () => {
    const { crop } = frameCrop(1920, 1080, 9 / 16, 1, 0.5, 0.5);
    expect((crop.width * 1920) / (crop.height * 1080)).toBeCloseTo(9 / 16);
    expect(crop.height).toBeCloseTo(1);
  });

  it("never zooms out past the whole photo", () => {
    expect(frameCrop(800, 600, 4 / 3, 0.5, 0.5, 0.5).crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});

describe("sizes", () => {
  it("turns a quarter or three", () => {
    expect(turnedSize(4, 3, 1)).toEqual({ width: 3, height: 4 });
    expect(turnedSize(4, 3, 2)).toEqual({ width: 4, height: 3 });
    expect(turnedSize(4, 3, -1)).toEqual({ width: 3, height: 4 });
  });

  it("measures the crop on the turned photo", () => {
    expect(cropSize(400, 300, { turns: 1, crop: { x: 0, y: 0, width: 0.5, height: 0.25 } })).toEqual({ width: 150, height: 100 });
    expect(cropSize(400, 300)).toEqual({ width: 400, height: 300 });
  });
});
