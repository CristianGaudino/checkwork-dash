// Makes the app icons (#11) from the Checkwork mark (src/app/icon.svg): public/brand/app-192.png and app-512.png (maskable: the mark sits
// inside the middle 80% safe zone on a full Midnight square) and apple-touch-icon.png (180, no transparency, iOS rounds the corners).
// Run once after the mark changes, and commit the files: node scripts/app-icons.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const mark = readFileSync(new URL("../src/app/icon.svg", import.meta.url), "utf8");
const inner = mark.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const MIDNIGHT = "#0b0f1f"; // --color-band in src/app/globals.css
// The mark is 60 by 48; at 56% of the width its corners stay inside the safe circle (radius 40%).
const svg = (size) => {
  const w = size * 0.56;
  const h = (w * 48) / 60;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="${MIDNIGHT}"/><svg x="${(size - w) / 2}" y="${(size - h) / 2}" width="${w}" height="${h}" viewBox="2 8 60 48">${inner}</svg></svg>`;
};
for (const [name, size] of [["app-192.png", 192], ["app-512.png", 512], ["apple-touch-icon.png", 180]]) {
  await sharp(Buffer.from(svg(size))).png().toFile(fileURLToPath(new URL(`../public/brand/${name}`, import.meta.url)));
  console.log(`public/brand/${name}`);
}
