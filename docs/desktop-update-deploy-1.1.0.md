# 桌面客户端下载与应用内更新 — 部署说明（1.1.0）

## 一、本次交付了什么

1. **平台（Web）三处下载入口**：顶栏下载按钮、系统设置页「桌面客户端」卡片、登录页下载链接。
   未发布安装包时登录页链接自动隐藏，其余入口显示"暂未发布"。
2. **公开下载路由 `/api/downloads/<路径>`**：免登录，仅放行 `.exe/.blockmap/.yml`，
   支持断点续传（Range），为 electron-updater 增量更新提供数据通道。
3. **公开版本端点 `/api/desktop/latest`**：读下载目录的 `latest.yml` 返回最新版本号，
   桌面端发版只需传文件，平台无需跟着发版。
4. **桌面端 1.1.0 应用内自动更新**：启动后自动检查（此后每 4 小时一次），发现新版本弹横幅
   「发现新版本 vX.Y.Z + 更新说明」→ 用户点「立即更新」→ 应用内下载（增量，只下差异块）→
   「重启以完成更新」→ 静默安装并自动重启。即使不点重启，退出时也会自动装上，下次打开即新版。
   设置页新增「检查更新」按钮；版本号改为读安装包真实版本。

## 二、上线顺序（重要，不要颠倒）

### 第 1 步：先部署平台

按现有上线包流程（预构建包 + PM2 restart）发布平台本次改动。涉及文件：

- `src/middleware.ts`（新增 `/api/downloads`、`/api/desktop/latest` 白名单）
- `src/lib/downloads.ts`（新增）
- `src/app/api/downloads/[...path]/route.ts`（新增）
- `src/app/api/desktop/latest/route.ts`（新增）
- `src/components/desktop-download.tsx`（新增）
- `src/components/layout/topbar.tsx`、`src/app/(app)/settings/page.tsx`、`src/app/login/page.tsx`（入口接线）

无需数据库变更，无需 env 变更（下载目录默认取 `UPLOAD_DIR/downloads`，生产即
`<UPLOAD_DIR>/downloads`；如需独立目录可设 `DOWNLOAD_DIR`）。

**宝塔/Nginx 注意**：无需新增任何静态 location，下载走 Next.js 进程。这与现有
"禁止 Nginx 直出 uploads"的安全要求一致。

### 第 2 步：上传桌面端 1.1.0 发布文件

在服务器创建目录并只上传 3 个文件：

```
<UPLOAD_DIR>/downloads/desktop/
├── DachuanPro-Setup-1.1.0.exe            （安装包）
├── DachuanPro-Setup-1.1.0.exe.blockmap   （增量更新块图，必须与 exe 同版本成对）
└── latest.yml                             （版本清单）
```

上传后自检（两个都应直接返回内容，不跳登录）：

```
curl https://dachuan.pro/api/desktop/latest
curl -I https://dachuan.pro/api/downloads/desktop/latest.yml
```

### 第 3 步：分发 1.1.0

现有 1.0.0 客户端没有更新器，需要**最后一次**手动安装 1.1.0（用户可从平台顶栏/登录页直接下载）。
从 1.2.0 起全部走应用内自动更新，不再需要分发安装包。

## 三、以后发新版（1.2.0+）只需三步

1. 桌面端仓库改 `package.json` 版本号、`src/lib/changelog.ts` 加更新说明，`npm run package:installer` 出包；
2. 把 release/ 里的 `DachuanPro-Setup-X.Y.Z.exe`+`.blockmap`+`latest.yml` 三个文件传到服务器同一目录；
3. 删掉旧版本的两个文件（exe+blockmap，`latest.yml` 直接覆盖）。老客户端最迟 4 小时内自动提示更新。

## 四、回滚

- 传回旧版三件套（exe/blockmap/latest.yml）即可把"最新版"指回旧版本（已更新的客户端不会自动降级，
  `allowDowngrade=false`，这是刻意行为）。
- 紧急关闭更新提示：删除服务器上 `latest.yml` 即可（检查会失败，客户端静默，不影响使用）。

## 五、验证结论（本机已完成）

- 下载路由：路径穿越拦截（403/重定向）、扩展名白名单（403）、Range 请求逐字节一致、
  越界 Range 返回 416、全量/后缀/分段 Range 三种模式全部正确。
- `/api/desktop/latest`：发布时返回版本+直链；未发布时 404 JSON。
- 三处入口 UI：登录页（发布显示/未发布隐藏）、顶栏弹层（版本/大小/按钮/文案）、
  设置页卡片，全部实测渲染正确。
- 桌面端：1.1.0 打包成功，electron-updater 依赖打入 asar；本地 feed 演练：打包版实例
  成功访问本地 feed、完成增量下载（sha512 校验通过）、拉起 NSIS 安装器。
  「检测发现新版本 → 横幅提示」环节：updater 事件链与 UI 组件均通过构建与类型检查，
  首次真实环境安装由用户拿到 1.1.0 后的升级（1.1.0 → 1.2.0）自然验证。
- 已知通用前提：NSIS 静默安装 perMachine=false 时无 UAC 交互，Windows 对未签名安装包的
  SmartScreen 提示与现状一致（首次安装时可能"仍要运行"）。

## 六、2026-10-05 更新源加固

- 正式更新来源固定为 `https://dachuan.pro/api/downloads/desktop`，登录服务器配置、渲染进程、环境变量和启动参数均不能覆盖。
- 本地 HTTP/LAN 更新演练不再适用于正式客户端；第五节为历史验收记录，本次仅验证单测、构建和静态检查，未执行 Windows 安装升级。
- 发布时先上传同版 exe 与 blockmap，再发布 latest.yml；保留上一版文件便于回滚和进行中的下载，不按第三节历史步骤立即删除旧文件。
- 正式 Windows 签名证书与签名后的安装/升级验收需在发行环境完成；当前仓库不能代替这项验证。
