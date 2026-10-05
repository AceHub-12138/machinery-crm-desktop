import type { View } from "../App";

export const ADMIN_VIEWS: ReadonlySet<View> = new Set([
  "users", "contract-unlock-requests", "contract-delete-requests", "operation-logs",
  "lead-hunter", "admin-agent", "admin-cockpit", "admin-config", "admin-health", "admin-master-data",
]);

const ERP_ROLE_DESKTOP_VIEWS: ReadonlySet<View> = new Set(["tasks", "chat", "settings"]);

/**
 * ERP 各页面的可见角色，与平台 sidebar.tsx / erp-roles.ts 的菜单矩阵一致：
 * 库存台账/物料三角色可看（读），BOM/仓库/出入库/调拨/盘点仅超管与仓库。
 */
export const ERP_VIEW_ROLES: Readonly<Record<string, readonly string[]>> = {
  "erp-dashboard": ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"],
  "erp-inventory": ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"],
  "erp-materials": ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"],
  "erp-bom": ["SUPER_ADMIN", "WAREHOUSE"],
  "erp-warehouse": ["SUPER_ADMIN", "WAREHOUSE"],
  "erp-stock-in": ["SUPER_ADMIN", "WAREHOUSE"],
  "erp-stock-out": ["SUPER_ADMIN", "WAREHOUSE"],
  "erp-stock-transfers": ["SUPER_ADMIN", "WAREHOUSE"],
  "erp-stock-check": ["SUPER_ADMIN", "WAREHOUSE"],
  // 采购与供应（二期）：供应商仅超管与采购；需求/订单/交期三角色可看
  "erp-suppliers": ["SUPER_ADMIN", "PURCHASE"],
  "erp-purchase-demands": ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"],
  "erp-purchase-orders": ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"],
  "erp-supplier-deliveries": ["SUPER_ADMIN", "PURCHASE", "WAREHOUSE"],
};

export function canAccessView(view: View, role?: string | null): boolean {
  if (!role) return false;
  if (role === "SUPER_ADMIN") return true;
  if (view.startsWith("erp-")) return (ERP_VIEW_ROLES[view] || []).includes(role);
  if (role === "PURCHASE" || role === "WAREHOUSE") return ERP_ROLE_DESKTOP_VIEWS.has(view);
  return !ADMIN_VIEWS.has(view);
}

/** 采购/仓库岗位登录后直达 ERP 工作台（对齐平台 middleware 弹回 /dashboard/erp 的行为） */
export function defaultViewForRole(role?: string | null): View {
  return role === "PURCHASE" || role === "WAREHOUSE" ? "erp-dashboard" : "dashboard";
}

const Route: Record<string, View> = {
  "/dashboard": "dashboard", "/dashboard/crm": "dashboard", "/dashboard/erp": "erp-dashboard", "/customers": "customers", "/leads": "leads", "/lead-hunter": "lead-hunter", "/products": "products",
  "/contracts": "contracts", "/shipments": "shipments", "/after-sales": "aftersales", "/chat": "chat",
  "/tasks": "tasks", "/users": "users", "/settings": "settings", "/contract-unlock-requests": "contract-unlock-requests",
  "/contract-delete-requests": "contract-delete-requests", "/operation-logs": "operation-logs", "/reminders": "reminders",
  "/admin/agent": "admin-agent", "/admin/cockpit": "admin-cockpit", "/admin/config": "admin-config",
  "/admin/health": "admin-health", "/admin/master-data": "admin-master-data", "/xiaochuan": "chat",
  "/erp/inventory": "erp-inventory", "/erp/materials": "erp-materials", "/erp/bom": "erp-bom",
  "/erp/warehouse": "erp-warehouse", "/erp/stock-in": "erp-stock-in", "/erp/stock-out": "erp-stock-out",
  "/erp/stock-transfers": "erp-stock-transfers", "/erp/stock-check": "erp-stock-check",
  "/erp/suppliers": "erp-suppliers", "/erp/purchase-demands": "erp-purchase-demands",
  "/erp/purchase-orders": "erp-purchase-orders", "/erp/supplier-deliveries": "erp-supplier-deliveries",
};

export interface NavigateEvent { view: View; params?: { customerId?: string; keyword?: string; [key: string]: string | undefined } }

export function parseHref(href?: string): NavigateEvent | null {
  if (!href) return null;
  let url: URL;
  let path: string;
  try {
    url = new URL(href, "https://desktop.dachuan.invalid");
    path = decodeURIComponent(url.pathname).replace(/\/+/g, "/").replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }
  const customerMatch = path.match(/^\/customers\/([^/]+)$/);
  if (customerMatch) return { view: "customers", params: { customerId: customerMatch[1] } };
  // 单条深链：工作台发货提醒行 → 合同详情；售后提醒行 → 售后工单详情
  const contractMatch = path.match(/^\/contracts\/([^/]+)$/);
  if (contractMatch) return { view: "contracts", params: { contractId: contractMatch[1] } };
  const afterSalesMatch = path.match(/^\/after-sales\/([^/]+)$/);
  if (afterSalesMatch) return { view: "aftersales", params: { afterSalesId: afterSalesMatch[1] } };
  if (path === "/tasks/monthly") {
    const params: NonNullable<NavigateEvent["params"]> = { mode: "monthly" };
    url.searchParams.forEach((value, key) => { params[key] = value; });
    return { view: "tasks", params };
  }
  // 采购订单详情/新建：/erp/purchase-orders/:id（含 new）
  const poMatch = path.match(/^\/erp\/purchase-orders\/([^/]+)$/);
  if (poMatch) {
    const params: NonNullable<NavigateEvent["params"]> = { poId: decodeURIComponent(poMatch[1]) };
    url.searchParams.forEach((value, key) => { params[key] = value; });
    return { view: "erp-purchase-orders", params };
  }
  const view = Route[path];
  if (!view) return null;
  const params: NavigateEvent["params"] = {};
  url.searchParams.forEach((value, key) => { params[key] = value; });
  return { view, params: Object.keys(params).length ? params : undefined };
}

export function navigate(href: string): boolean {
  const target = parseHref(href);
  if (!target) return false;
  return window.dispatchEvent(new CustomEvent<NavigateEvent>("dc:navigate", { detail: target, cancelable: true }));
}
