// Generate the PWA icon set from the vessel photo.
// Run: npm run icons   (regenerates everything from public/vessel.png)
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = "public/vessel.png";
const OUT = "public/icons";
mkdirSync(OUT, { recursive: true });

// Standard square icons: center-cropped cover of the photo.
const SIZES = [180, 192, 512];
for (const size of SIZES) {
  await sharp(SRC)
    .resize(size, size, { fit: "cover", position: "centre" })
    .png()
    .toFile(`${OUT}/icon-${size}.png`);
  console.log(`wrote ${OUT}/icon-${size}.png`);
}

// Maskable icon: keep the photo inside the center ~80% safe zone, padded on a
// dark slate background (matches the theme color) so Android can mask it.
const PAD = Math.round(512 * 0.1); // ~10% padding each side
const inner = await sharp(SRC)
  .resize(512 - PAD * 2, 512 - PAD * 2, { fit: "cover", position: "centre" })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: 512,
    height: 512,
    channels: 4,
    background: { r: 15, g: 23, b: 42, alpha: 1 }, // #0f172a
  },
})
  .composite([{ input: inner, left: PAD, top: PAD }])
  .png()
  .toFile(`${OUT}/icon-maskable-512.png`);
console.log(`wrote ${OUT}/icon-maskable-512.png`);

console.log("done.");
