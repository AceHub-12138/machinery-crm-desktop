# 大川Pro 桌面客户端(dachuanpro-desktop)

大川机床 DachuanPro 平台的 Windows 桌面工作台:不用记网址,双击打开、账号登录即用,新版本自动更新。

> 平台源码:[machinery-crm](https://github.com/AceHub-12138/machinery-crm) · 可视化大屏:[machinery-crm-visual-dashboard](https://github.com/AceHub-12138/machinery-crm-visual-dashboard)

## 功能

- 平台账号登录:与 DachuanPro 服务端同一套账号,CSRF 安全校验
- 工作台首页:KPI 仪表盘、销售目标
- CRM:客户、线索、报价、合同(含删除/解锁审批)、发货、售后、任务与提醒
- ERP:生产、物料库存、采购一屏管理
- AI:内置 AI 助手「小川」对话窗口
- 管理后台:Agent 账号管理、系统配置、健康检查、操作日志
- 附件预览与导出(xlsx / PDF)
- 自动更新:新版本由服务端统一下发(electron-updater)

## 技术栈

Electron 33 · Vite 6 · React 19 · TypeScript · electron-builder

## 开发

```bash
npm install
npm run dev                 # 开发模式
npm run test                # 类型检查 + 单元测试
npm run build               # 构建(渲染层 + 主进程)
npm run package:installer   # 打 Windows 安装包
```

## 相关仓库

| 仓库 | 说明 |
|---|---|
| [machinery-crm](https://github.com/AceHub-12138/machinery-crm) | 平台源码(Next.js 16 + Prisma + MySQL) |
| [machinery-crm-visual-dashboard](https://github.com/AceHub-12138/machinery-crm-visual-dashboard) | 经营指挥舱可视化大屏 + 语音交互 |

## 版权

© 2026 大川机床(Dachuan)。仅用于技术展示与交流,未附开源许可证,保留所有权利;仓库中不含任何客户数据与生产密钥。
