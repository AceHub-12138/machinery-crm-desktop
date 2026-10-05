import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, Target, Package, FileText, Truck, Wrench,
  MessageSquareText, LogOut, ChevronsLeft, ChevronsRight, CheckSquare,
  Settings, UserCog, FileCheck, FileX, History, Bell, Bot,
  Activity, Sliders, HeartPulse, Database,
  PackageSearch, Boxes, Component, Warehouse, PackagePlus, PackageMinus,
  ArrowLeftRight, ClipboardCheck, ListChecks, ShoppingCart, CalendarClock, Building2,
  Gauge,
} from "lucide-react";
import type { SessionUser } from "../lib/ipc";
import { ROLE_LABEL } from "../lib/format";
import { useTheme } from "../lib/theme";
import { Switch } from "./ui";
import { SPRING_CSS } from "../lib/motion";
import logoBadge from "../assets/logo-badge.png";
import type { View } from "../App";
import { canAccessView } from "../lib/navigation";

const GROUPS: { label: string; items: { key: View; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean }[] }[] = [
  {
    label: "总览",
    items: [
      { key: "dashboard", label: "工作台", icon: LayoutDashboard },
      { key: "erp-dashboard", label: "ERP 工作台", icon: Gauge },
    ],
  },
  {
    label: "客户",
    items: [
      { key: "customers", label: "客户管理", icon: Users },
      { key: "leads", label: "线索池", icon: Target },
      { key: "lead-hunter", label: "获客助手", icon: Target },
    ],
  },
  {
    label: "销售",
    items: [
      { key: "products", label: "产品库", icon: Package },
      { key: "contracts", label: "合同管理", icon: FileText },
    ],
  },
  {
    label: "履约",
    items: [
      { key: "shipments", label: "发货管理", icon: Truck },
      { key: "aftersales", label: "售后服务", icon: Wrench },
    ],
  },
  // ERP 板块（分组名与顺序与平台侧边栏一致：采购与供应 → 库存与物料）
  {
    label: "采购与供应",
    items: [
      { key: "erp-purchase-demands", label: "采购需求", icon: ListChecks },
      { key: "erp-purchase-orders", label: "采购订单", icon: ShoppingCart },
      { key: "erp-supplier-deliveries", label: "供应商交期", icon: CalendarClock },
      { key: "erp-suppliers", label: "供应商管理", icon: Building2 },
    ],
  },
  {
    label: "库存与物料",
    items: [
      { key: "erp-inventory", label: "库存台账", icon: PackageSearch },
      { key: "erp-materials", label: "物料管理", icon: Boxes },
      { key: "erp-bom", label: "整机用料 BOM", icon: Component },
      { key: "erp-warehouse", label: "仓库设置", icon: Warehouse },
      { key: "erp-stock-in", label: "入库单", icon: PackagePlus },
      { key: "erp-stock-out", label: "出库单", icon: PackageMinus },
      { key: "erp-stock-transfers", label: "库存调拨", icon: ArrowLeftRight },
      { key: "erp-stock-check", label: "盘点单", icon: ClipboardCheck },
    ],
  },
  {
    label: "协作",
    items: [
      { key: "tasks", label: "我的工作", icon: CheckSquare },
      { key: "reminders", label: "跟进提醒", icon: Bell },
      { key: "chat", label: "小川 AI 助手", icon: MessageSquareText },
    ],
  },
  {
    label: "审批",
    items: [
      { key: "contract-unlock-requests", label: "合同解锁审批", icon: FileCheck, adminOnly: true },
      { key: "contract-delete-requests", label: "合同删除审批", icon: FileX, adminOnly: true },
      { key: "operation-logs", label: "操作日志", icon: History, adminOnly: true },
    ],
  },
  {
    label: "管理",
    items: [
      { key: "users", label: "用户管理", icon: UserCog, adminOnly: true },
      { key: "settings", label: "系统设置", icon: Settings },
    ],
  },
  {
    label: "高级",
    items: [
      { key: "admin-cockpit", label: "系统驾驶舱", icon: Activity, adminOnly: true },
      { key: "admin-agent", label: "Agent 配置", icon: Bot, adminOnly: true },
      { key: "admin-config", label: "系统配置", icon: Sliders, adminOnly: true },
      { key: "admin-health", label: "健康检查", icon: HeartPulse, adminOnly: true },
      { key: "admin-master-data", label: "主数据管理", icon: Database, adminOnly: true },
    ],
  },
];

export default function Sidebar({
  view,
  onNavigate,
  user,
  onLogout,
}: {
  view: View;
  onNavigate: (v: View) => void;
  user: SessionUser;
  onLogout: () => void;
}) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("dc.sidebar") === "1");
  const { theme, toggle } = useTheme();

  useEffect(() => {
    localStorage.setItem("dc.sidebar", collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <aside
      className={`relative z-20 flex h-full shrink-0 flex-col border-r border-line bg-[color:var(--titlebar-bg)] backdrop-blur-2xl transition-[width] duration-300 ${
        collapsed ? "w-[76px]" : "w-56"
      }`}
      style={{ transitionTimingFunction: SPRING_CSS }}
    >
      {/* 品牌区 */}
      <div className={`flex h-14 shrink-0 items-center gap-2.5 border-b border-line/60 ${collapsed ? "justify-center px-0" : "px-4"}`}>
        <img src={logoBadge} alt="" className="h-7 w-7 rounded-md" draggable={false} />
        {!collapsed && (
          <div className="leading-tight whitespace-nowrap">
            <div className="text-sm font-semibold">大川Pro</div>
            <div className="text-[10px] text-faint mono tracking-wider">CRM / ERP WORKBENCH</div>
          </div>
        )}
      </div>

      {/* 导航分组 */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3">
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-3">
            <div
              className={`px-2 pb-1.5 text-[10px] font-medium tracking-[0.2em] text-faint transition-opacity duration-200 ${
                collapsed ? "opacity-0" : "opacity-100"
              }`}
            >
              {collapsed ? "·" : group.label}
            </div>
            {group.items.map(({ key, label, icon: Icon, adminOnly }) => {
              // 菜单可见性与 App 导航守卫复用同一平台角色策略。
              if (!canAccessView(key, user.role) || (adminOnly && user.role !== "SUPER_ADMIN")) return null;

              const active = view === key;
              return (
                <button
                  key={key}
                  title={collapsed ? label : undefined}
                  onClick={() => onNavigate(key)}
                  className={`group relative mb-0.5 flex w-full items-center gap-2.5 rounded-xl border py-2 text-sm transition-all ${
                    collapsed ? "justify-center px-0" : "px-2.5"
                  } ${
                    active
                      ? "border-brand/25 bg-brand/12 text-brandhi shadow-[0_0_14px_rgba(238,125,44,0.14)]"
                      : "border-transparent text-dim hover:bg-panel2 hover:text-ink"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand shadow-[0_0_8px_rgba(238,125,44,0.8)]" />
                  )}
                  <Icon size={17} strokeWidth={active ? 2.2 : 1.7} className="shrink-0" />
                  {!collapsed && (
                    <span className="flex-1 whitespace-nowrap text-left">{label}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 主题切换（折叠时隐藏，标题栏也有入口） */}
      {!collapsed && (
        <div className="mx-3 mb-2 flex items-center justify-between rounded-xl border border-line bg-panel2/60 px-3 py-2">
          <span className="text-xs text-dim">浅色主题</span>
          <Switch checked={theme === "light"} onChange={toggle} />
        </div>
      )}

      {/* 折叠开关 */}
      <button
        title={collapsed ? "展开侧栏" : "折叠侧栏"}
        onClick={() => setCollapsed((c) => !c)}
        className={`mb-1 flex w-full items-center justify-center gap-2 py-2 text-xs text-faint transition-colors hover:bg-panel2 hover:text-ink ${
          collapsed ? "px-0" : "px-3"
        }`}
      >
        {collapsed ? <ChevronsRight size={15} /> : (
          <>
            <ChevronsLeft size={15} /> <span>折叠侧栏</span>
          </>
        )}
      </button>

      {/* 用户区 */}
      <div className={`flex items-center gap-2.5 border-t border-line/60 p-3 ${collapsed ? "flex-col" : ""}`}>
        <div
          title={`${user.name || user.email || "用户"} · ${ROLE_LABEL[user.role || ""] || "成员"}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-panel2 text-xs font-medium text-dim"
        >
          {(user.name || user.email || "用").slice(0, 1)}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-xs">{user.name || user.email || "用户"}</div>
            <div className="text-[10px] text-faint">{ROLE_LABEL[user.role || ""] || user.role || "成员"}</div>
          </div>
        )}
        <button
          title="退出登录"
          onClick={onLogout}
          className={`flex h-7 w-7 items-center justify-center rounded-lg text-faint transition-colors hover:bg-bad/10 hover:text-bad ${
            collapsed ? "" : "shrink-0"
          }`}
        >
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}
