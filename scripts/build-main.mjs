import { build } from "esbuild";
import { mkdirSync, copyFileSync } from "node:fs";

mkdirSync("dist-electron", { recursive: true });

// 图标随 dist-electron 一起进安装包（主进程用 __dirname 取，开发和打包环境通用）
copyFileSync("build/icon.png", "dist-electron/icon.png");
copyFileSync("build/tray.png", "dist-electron/tray.png");
const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  target: "node20",
  sourcemap: false,
  minify: false,
};

await build({ ...shared, entryPoints: ["electron/main.ts"], outfile: "dist-electron/main.cjs" });
await build({
  ...shared,
  entryPoints: ["electron/preload.ts"],
  outfile: "dist-electron/preload.cjs",
});
console.log("main/preload 构建完成 -> dist-electron/（含 icon.png/tray.png）");
