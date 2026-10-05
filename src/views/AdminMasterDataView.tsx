import { AlertTriangle, Database, Users, Target, Package, UserCog } from "lucide-react";
import { getCachedUser } from "../lib/api";
import { navigate } from "../lib/navigation";

/** 基础资料中心：与平台网页端同款定位——复用既有业务数据和页面，不提供无业务用途的空资料表。
 * ERP 侧（供应商/物料/仓库等）桌面端暂无模块，仅呈现不可点状态。 */

interface Entry {
  label: string;
  icon: typeof Users;
  /** navigate() 用的平台路径；与桌面视图经 navigation.ts 映射 */
  path: string;
  note?: string;
}

interface Group {
  title: string;
  entries: Entry[];
}

const GROUPS: Group[] = [
  {
    title: "销售基础资料",
    entries: [
      { label: "客户", icon: Users, path: "/customers" },
      { label: "线索（待跟进池）", icon: Target, path: "/leads" },
      { label: "产品", icon: Package, path: "/products" },
    ],
  },
  {
    title: "平台基础资料",
    entries: [
      { label: "用户", icon: UserCog, path: "/users" },
      { label: "Agent 模型配置", icon: Database, path: "/admin/agent" },
    ],
  },
];

export default function AdminMasterDataView() {
  const user = getCachedUser();
  const isAdmin = user?.role === "SUPER_ADMIN";

  if (!isAdmin) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="rounded-2xl border border-line bg-panel p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 size-12 text-amber-500" />
          <p className="text-sm text-bad">无权访问主数据管理</p>
          <p className="mt-2 text-xs text-faint">仅超级管理员可访问此功能</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-6xl space-y-5">
          {/* 页面标题 */}
          <div>
            <h1 className="text-2xl font-semibold text-ink">基础资料中心</h1>
            <p className="mt-1 text-sm text-dim">
              复用既有业务数据和页面，不创建无业务用途的空资料表（与平台网页端口径一致）
            </p>
          </div>

          {/* 供应商等 ERP 资料说明：桌面端暂无 ERP 模块 */}
          <div className="rounded-2xl border border-line bg-panel p-4 text-sm text-dim">
            <span className="font-medium text-ink">供应链基础资料</span>
            （供应商 / 物料 / 物料分类 / 仓库 / 整机用料清单）属于 ERP 模块，桌面端暂未包含；
            如需操作可在平台网页端的“基础资料中心”处理。
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {GROUPS.map((group) => (
              <section key={group.title} className="rounded-2xl border border-line bg-panel p-5 shadow-sm">
                <h2 className="text-base font-semibold text-ink">{group.title}</h2>
                <div className="mt-3 space-y-2">
                  {group.entries.map((entry) => {
                    const Icon = entry.icon;
                    return (
                      <button
                        key={entry.label}
                        onClick={() => navigate(entry.path)}
                        className="flex w-full items-center gap-3 rounded-xl bg-panel2/60 px-3.5 py-2.5 text-left text-sm text-ink transition-colors hover:bg-brand/10"
                      >
                        <Icon size={16} className="shrink-0 text-brand" />
                        <span className="min-w-0 flex-1">{entry.label}</span>
                        {entry.note && <span className="shrink-0 text-xs text-faint">{entry.note}</span>}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
