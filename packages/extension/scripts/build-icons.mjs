import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(here, "..", "icons");
const svg = readFileSync(join(iconsDir, "source.svg"), "utf8");

const sizes = [16, 48, 128];
for (const size of sizes) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } })
    .render()
    .asPng();
  const out = join(iconsDir, `icon${size}.png`);
  writeFileSync(out, png);
  console.log(`wrote ${out} (${png.byteLength} bytes)`);
}
