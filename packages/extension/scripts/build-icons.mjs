import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(here, "..", "icons");
const storeDir = join(here, "..", "store-assets");

// Manifest icons: 16/48/128 from icons/source.svg
const iconSvg = readFileSync(join(iconsDir, "source.svg"), "utf8");
for (const size of [16, 48, 128]) {
  const png = new Resvg(iconSvg, { fitTo: { mode: "width", value: size } })
    .render()
    .asPng();
  const out = join(iconsDir, `icon${size}.png`);
  writeFileSync(out, png);
  console.log(`wrote ${out} (${png.byteLength} bytes)`);
}

// Promotional tile (small): 440x280 — Chrome Web Store listing
const promoSvg = readFileSync(join(storeDir, "promo-tile-source.svg"), "utf8");
const promo = new Resvg(promoSvg, { fitTo: { mode: "width", value: 440 } })
  .render()
  .asPng();
const promoOut = join(storeDir, "promo-tile-440x280.png");
writeFileSync(promoOut, promo);
console.log(`wrote ${promoOut} (${promo.byteLength} bytes)`);
