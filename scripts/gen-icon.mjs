// 品牌资产同步：从平台仓库 public/ 复制官方 Logo，生成桌面端所需图标
// 平台资产：icons/icon-512.png（方形徽标）、icons/favicon-32.png（32px）
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import * as path from "node:path";

const PLATFORM_PUBLIC =
  process.env.PLATFORM_PUBLIC ||
  path.resolve(import.meta.dirname, "../../machinery-crm-source/machinery-crm-v108-release/public");

mkdirSync("build", { recursive: true });
mkdirSync("src/assets", { recursive: true });
mkdirSync("dist-electron", { recursive: true });

// electron-builder：Windows 图标直接吃 build/icon.png（≥256px 自动转 ico，exe/安装包/卸载器共用）
copyFileSync(path.join(PLATFORM_PUBLIC, "icons/icon-512.png"), "build/icon.png");
rmSync("build/icon.ico", { force: true }); // 移除旧的自绘图标，避免覆盖官方徽标
copyFileSync(path.join(PLATFORM_PUBLIC, "icons/favicon-32.png"), "build/tray.png");

// 渲染进程内使用（登录页/标题栏/对话页）
copyFileSync(path.join(PLATFORM_PUBLIC, "icons/icon-192.png"), "src/assets/logo-badge.png");

console.log("品牌资产已同步: build/icon.png(512) / build/tray.png(32) / src/assets/logo-badge.png(192)");
