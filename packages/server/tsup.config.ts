import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    instrumentation: "src/instrumentation.ts",
    react: "src/react.tsx",
    route: "src/route.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["react", "next"],
  target: "node18",
});
