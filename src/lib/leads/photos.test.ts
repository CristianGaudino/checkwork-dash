import { describe, expect, it } from "vitest";
import { sniffImage } from "./photos";

const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0]);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const WEBP = new Uint8Array([...new TextEncoder().encode("RIFF"), 1, 2, 3, 4, ...new TextEncoder().encode("WEBPVP8 ")]);

describe("sniffImage", () => {
  it("knows JPEG, PNG and WebP by their bytes", () => {
    expect(sniffImage(JPEG)).toEqual({ ext: "jpg", contentType: "image/jpeg" });
    expect(sniffImage(PNG)).toEqual({ ext: "png", contentType: "image/png" });
    expect(sniffImage(WEBP)).toEqual({ ext: "webp", contentType: "image/webp" });
  });

  it("reports a PNG named .jpg as a PNG, and refuses GIF, SVG, other RIFF files and empty bytes", () => {
    expect(new File([PNG], "car.jpg", { type: "image/jpeg" }).name).toBe("car.jpg"); // the name never reaches sniffImage
    expect(sniffImage(PNG)?.ext).toBe("png");
    expect(sniffImage(new TextEncoder().encode("GIF89a......"))).toBeNull();
    expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("RIFF....WAVEfmt "))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});
