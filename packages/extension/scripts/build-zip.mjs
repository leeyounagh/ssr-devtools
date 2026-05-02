import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import archiver from "archiver";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = resolve(root, "dist");
mkdirSync(outDir, { recursive: true });

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const outPath = join(outDir, `ssr-devtools-v${manifest.version}.zip`);

const output = createWriteStream(outPath);
const archive = archiver("zip", { zlib: { level: 9 } });

const finished = new Promise((resolveDone, rejectDone) => {
  output.on("close", () => resolveDone(archive.pointer()));
  output.on("error", rejectDone);
  archive.on("error", rejectDone);
  archive.on("warning", (err) => {
    if (err.code === "ENOENT") console.warn(err);
    else throw err;
  });
});

archive.pipe(output);

const runtimeFiles = [
  "manifest.json",
  "devtools.html",
  "devtools.js",
  "panel.html",
  "panel.css",
  "panel.js",
];
for (const f of runtimeFiles) {
  archive.file(join(root, f), { name: f });
}
for (const size of [16, 48, 128]) {
  archive.file(join(root, "icons", `icon${size}.png`), {
    name: `icons/icon${size}.png`,
  });
}

await archive.finalize();
const bytes = await finished;
console.log(`wrote ${outPath} (${bytes} bytes)`);
