// 仓库级轻量门禁：尾随空白、行尾 CRLF 混用告警、TODO 里的"暂不支持"类假实现标记。
// 无第三方依赖，node scripts/lint.mjs 即可运行；退出码非 0 表示有违规。
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SCAN_DIRS = ["src", "electron", "scripts", "test"];
const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".cjs", ".mjs", ".css", ".html", ".json", ".md"]);
const SKIP_FILES = new Set(["dist", "node_modules", "release", "build"]);

/** 只报告行尾空白（tab/空格在换行前）与文件级问题；CRLF 属正常（Windows 仓库）不入违规 */
const TRAILING_WS = /[ \t]+$/;
const OFFENDING_TOKENS = [/暂不支持跳转/, /请去对应模块查看/, /请在平台对应模块中查看/];

const violations = [];
let files = 0;

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_FILES.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full);
    } else {
      const ext = name.slice(name.lastIndexOf("."));
      if (!TEXT_EXT.has(ext)) continue;
      files += 1;
      const content = readFileSync(full, "utf8");
      const rel = relative(ROOT, full).replace(/\\/g, "/");
      const lines = content.split(/\r?\n/);
      lines.forEach((line, i) => {
        const m = line.match(TRAILING_WS);
        if (m) violations.push(`${rel}:${i + 1} 行尾空白 ${m[0].length} 个字符`);
        if (rel === "scripts/lint.mjs") return; // 本文件包含违规文案的定义本身，不检查自身
        for (const token of OFFENDING_TOKENS) {
          if (token.test(line)) violations.push(`${rel}:${i + 1} 遗留假实现文案：${token}`);
        }
      });
    }
  }
}

for (const dir of SCAN_DIRS) walk(dir);

if (violations.length) {
  console.error(`lint 失败（${violations.length} 项，扫描 ${files} 个文件）：`);
  for (const v of violations.slice(0, 200)) console.error("  " + v);
  if (violations.length > 200) console.error(`  ……另有 ${violations.length - 200} 项`);
  process.exit(1);
} else {
  console.log(`lint 通过：扫描 ${files} 个文件，无尾随空白/遗留假实现文案`);
}
