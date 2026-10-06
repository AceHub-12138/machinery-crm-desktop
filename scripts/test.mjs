import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Windows/macOS/Linux 使用同一业务时区；不用依赖 Unix 的 TZ=... 命令语法。
const files = readdirSync(new URL("../test/", import.meta.url))
  .filter((file) => file.endsWith(".test.mjs")).sort().map((file) => `test/${file}`);
const result = spawnSync(process.execPath, ["--test", "--experimental-strip-types", "--no-warnings", ...files], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, TZ: "Asia/Shanghai" },
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
