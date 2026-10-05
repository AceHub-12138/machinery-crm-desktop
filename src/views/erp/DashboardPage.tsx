import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, ArrowRight, Banknote, Boxes, ClipboardList, Factory, History,
  PackageMinus, PackagePlus, PackageX, RefreshCw, ShoppingCart, Warehouse as WarehouseIcon,
} from "lucide-react";
import { api } from "../../lib/api";
import { Pill, Spinner, ErrorTip } from "../../components/ui";
import { ERP_MOVEMENT_TYPE } from "../../lib/erp";
import { money } from "../../lib/format";
import { navigate } from "../../lib/navigation";
import type { ErpDashboardResponse, ErpDashboardRoleView } from "../../types";

const ROLE_VIEW_META: Record<ErpDashboardRoleView, { title: string; description: string }> = {
  ADMIN: { title: "全局视图", description: "以库存为主视图，集中查看库存健康与生产、采购风险。" },
  PURCHASE: { title: "采购视图", description: "聚焦库存预警、采购需求与供应交付风险。" },
  WAREHOUSE: { title: "仓库视图", description: "聚焦各仓库库存健康、收发执行与异常提醒。" },
};

const MOVEMENT_TONE: Record<string, string> = {
  STOCK_IN: "text-ok bg-ok/10",
  STOCK_OUT: "text-bad bg-bad/10",
  CHECK_ADJUST: "text-dim bg-steel/25",
  TRANSFER_IN: "text-brandhi bg-brand/10",
  TRANSFER_OUT: "text-brandhi bg-brand/10",
};

interface QuickAction { label: string; description: string; href: string; icon: typeof Boxes }

/** 每个角色视图的快捷操作四宫格（对齐平台 quickActions；生产工单入口桌面端暂无，采购视图以采购需求替代） */
const QUICK_ACTIONS: Record<ErpDashboardRoleView, QuickAction[]> = {
  ADMIN: [
    { label: "库存台账", description: "查看全部仓库库存", href: "/erp/inventory", icon: Boxes },
    { label: "入库", description: "处理到货与入库", href: "/erp/stock-in", icon: PackagePlus },
    { label: "出库", description: "处理领料与出库", href: "/erp/stock-out", icon: PackageMinus },
    { label: "物料管理", description: "维护物料与预警线", href: "/erp/materials", icon: ClipboardList },
  ],
  PURCHASE: [
    { label: "采购订单", description: "查看订单执行状态", href: "/erp/purchase-orders", icon: ClipboardList },
    { label: "供应商管理", description: "查看采购供应商", href: "/erp/suppliers", icon: ShoppingCart },
    { label: "库存预警", description: "查看低库存物料", href: "/erp/inventory?alertOnly=1", icon: Boxes },
    { label: "采购需求", description: "处理待转单需求", href: "/erp/purchase-demands", icon: ClipboardList },
  ],
  WAREHOUSE: [
    { label: "库存台账", description: "查看仓库当前库存", href: "/erp/inventory", icon: Boxes },
    { label: "采购入库", description: "处理到货与入库", href: "/erp/stock-in", icon: PackagePlus },
    { label: "出库", description: "处理领料与出库", href: "/erp/stock-out", icon: PackageMinus },
    { label: "库存调拨", description: "查看仓间调拨", href: "/erp/stock-transfers", icon: WarehouseIcon },
  ],
};

/** ERP 工作台：管理员/采购/仓库三种角色视图的着陆页（对齐平台 /dashboard/erp） */
export default function DashboardPage() {
  const [data, setData] = useState<ErpDashboardResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [showExtras, setShowExtras] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api<ErpDashboardResponse>("/api/erp/dashboard"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data && error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <span className="text-sm text-bad">{error}</span>
        <button className="btn-ghost" onClick={() => void load()}>重试</button>
      </div>
    );
  }
  if (!data) {
    return <div className="flex-1 flex items-center justify-center"><Spinner /></div>;
  }

  const roleView: ErpDashboardRoleView = data.roleView || "WAREHOUSE";
  const viewMeta = ROLE_VIEW_META[roleView] || ROLE_VIEW_META.WAREHOUSE;
  const production = data.production?.data;
  const kit = data.kitCheck?.data;
  const procurement = data.procurement?.data;
  const inventory = data.inventory?.data;
  const movements = data.movements?.data;
  const alerts = data.alerts?.data;

  const amountVisible = inventory?.inventoryValue !== undefined;
  const keyword = warehouseFilter.trim().toLowerCase();
  const warehouses = (inventory?.warehouses || []).filter((warehouse) =>
    !keyword || warehouse.name.toLowerCase().includes(keyword) || (warehouse.code || "").toLowerCase().includes(keyword));
  const hasProductionData = Boolean(production && Object.values(production.statusDistribution || {}).some((count) => Number(count) > 0));
  const hasProcurementData = Boolean(procurement && (procurement.pendingDemands > 0 || procurement.delayedItems > 0 || (procurement.orders || []).length > 0));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-5 space-y-5">
        {/* 角色视图卡 */}
        <div className="panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brandhi">
                {roleView === "PURCHASE" ? <ShoppingCart size={22} /> : roleView === "WAREHOUSE" ? <WarehouseIcon size={22} /> : <Factory size={22} />}
              </div>
              <div>
                <p className="text-sm font-medium text-brandhi">ERP · {viewMeta.title}</p>
                <h1 className="mt-1 text-xl font-semibold">ERP 工作台</h1>
                <p className="mt-1.5 text-sm text-dim">{viewMeta.description}</p>
                <p className="mt-1 text-xs text-faint">更新于 {data.generatedAt ? new Date(data.generatedAt).toLocaleString("zh-CN") : "暂无更新时间"}</p>
              </div>
            </div>
            <button className="btn-ghost" disabled={loading} onClick={() => void load()}>
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              刷新数据
            </button>
          </div>
        </div>

        {/* 指标卡 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="库存报警" value={inventory?.alertCount} icon={<AlertTriangle size={18} />} href="/erp/inventory?alertOnly=1" error={data.inventory?.error} />
          <MetricCard title="零库存物料" value={inventory?.zeroCount} icon={<PackageX size={18} />} href="/erp/inventory?zeroStock=1" error={data.inventory?.error} />
          <MetricCard title="在库物料种类" value={inventory?.activeKinds} icon={<Boxes size={18} />} href="/erp/inventory" error={data.inventory?.error} />
          {amountVisible ? (
            <MetricCard title="库存总金额" valueText={money(inventory?.inventoryValue)} icon={<Banknote size={18} />} href="/erp/inventory" error={data.inventory?.error} />
          ) : (
            <MetricCard title="90 天无动动物料" value={inventory?.staleMaterials} icon={<History size={18} />} href="/erp/inventory" error={data.inventory?.error} />
          )}
        </div>

        {/* 仓库快捷入口 */}
        <Section title="仓库快捷入口" description="点击仓库卡片直达该仓库的库存台账，预警角标可只看该仓预警物料" error={data.inventory?.error} onRetry={load}>
          <input
            className="input mb-4 !max-w-xs"
            placeholder="搜索仓库名称或编码…"
            value={warehouseFilter}
            onChange={(event) => setWarehouseFilter(event.target.value)}
          />
          {warehouses.length === 0 ? (
            <EmptyHint>没有匹配的仓库，请调整搜索关键词。</EmptyHint>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {warehouses.map((warehouse) => (
                <div key={warehouse.id} className="rounded-xl border border-line bg-panel2/40 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brandhi">
                      <WarehouseIcon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{warehouse.name}</p>
                      <p className="mt-0.5 text-xs text-faint">编码：{warehouse.code || "—"}</p>
                    </div>
                    {warehouse.alertCount > 0 && <Pill tone="text-bad bg-bad/10">预警 {warehouse.alertCount}</Pill>}
                  </div>
                  <div className="mt-3 space-y-1 text-sm">
                    <p className="text-dim">{warehouse.kinds > 0 ? `在库 ${warehouse.kinds.toLocaleString()} 种物料` : "暂无在库物料"}</p>
                    {amountVisible && warehouse.value !== undefined && (
                      <p className="text-xs text-faint mono">库存金额 {money(warehouse.value)}</p>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-4 border-t border-line pt-3 text-sm">
                    <button className="inline-flex items-center gap-1 font-medium text-brandhi hover:underline" onClick={() => navigate(`/erp/inventory?warehouseId=${warehouse.id}`)}>
                      进入台账 <ArrowRight size={14} />
                    </button>
                    {warehouse.alertCount > 0 && (
                      <button className="inline-flex items-center gap-1 font-medium text-bad hover:underline" onClick={() => navigate(`/erp/inventory?warehouseId=${warehouse.id}&alertOnly=1`)}>
                        看预警 {warehouse.alertCount} 项 <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {/* 预警物料榜 */}
          <Section title="预警物料榜" description="当前低于预警线的物料（按缺口大小排序，最多显示 8 条）" error={data.inventory?.error} onRetry={load}>
            {(inventory?.alerts || []).length === 0 ? (
              <EmptyHint>当前没有低于预警线的物料。</EmptyHint>
            ) : (
              <>
                <div className="space-y-2">
                  {(inventory?.alerts || []).map((item) => (
                    <div key={`${item.warehouseId}-${item.materialId}`} className="flex items-center justify-between gap-3 rounded-xl bg-panel2/50 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="mt-0.5 truncate text-xs text-faint">{item.code} · {item.warehouse}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-bad">缺口 {item.gap.toLocaleString()} {item.unit}</p>
                        <p className="mt-0.5 text-xs text-faint">现存 {item.quantity.toLocaleString()} / 预警线 {item.threshold.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <SectionLink href="/erp/inventory?alertOnly=1" label="查看全部预警" />
              </>
            )}
          </Section>

          {/* 最近出入库动态 */}
          <Section title="最近出入库动态" description="最近 8 条出入库与调拨流水" error={data.movements?.error} onRetry={load}>
            {(movements?.items || []).length === 0 ? (
              <EmptyHint>还没有出入库记录——完成第一笔入库后，这里会显示最新动态。</EmptyHint>
            ) : (
              <div className="space-y-2">
                {(movements?.items || []).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-panel2/50 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Pill tone={MOVEMENT_TONE[item.type] || "text-dim bg-steel/25"}>{ERP_MOVEMENT_TYPE[item.type] || item.type}</Pill>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.materialName}</p>
                        <p className="mt-0.5 truncate text-xs text-faint">{item.warehouse} · {item.materialCode}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">{item.quantity.toLocaleString()} {item.unit}</p>
                      <p className="mt-0.5 text-xs text-faint">{item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* 生产与采购（可折叠） */}
        <div className="panel p-5">
          <button className="flex w-full items-center justify-between gap-4 text-left" onClick={() => setShowExtras((visible) => !visible)}>
            <div>
              <h2 className="font-semibold">生产与采购</h2>
              <p className="mt-1 text-sm text-faint">生产执行、齐套缺料与采购供应风险（相关模块启用后自动显示数据）</p>
            </div>
            <span className="shrink-0 text-sm font-medium text-brandhi">{showExtras ? "收起 ▲" : "展开 ▼"}</span>
          </button>
          {showExtras && (
            <div className="mt-5 grid grid-cols-1 gap-6 xl:grid-cols-2">
              <SubSection title="生产执行" description="生产工单进度、交期和缺料风险" error={data.production?.error} onRetry={load}>
                {hasProductionData && production ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <SectionMetric label="已逾期" value={production.kpis.overdue} tone="danger" />
                      <SectionMetric label="待齐套" value={production.kpis.pendingKitCheck} tone="warning" />
                      <SectionMetric label="缺料影响工单" value={production.totals.shortageOrders} tone="danger" />
                      <SectionMetric label="7 天内到期（含逾期）" value={production.totals.riskOrders} tone="warning" />
                    </div>
                    <p className="mt-3 text-xs text-faint">生产工单模块桌面端尚未上线，统计数据仅供参考。</p>
                  </>
                ) : (
                  <EmptyHint>生产工单模块暂未产生数据——创建生产工单后，这里会显示逾期、齐套与缺料风险。</EmptyHint>
                )}
              </SubSection>

              <SubSection title="齐套和缺料" description="齐套结果严格沿用现有统计公式" error={data.kitCheck?.error} onRetry={load}>
                {kit && kit.total > 0 ? (
                  <>
                    <div className="rounded-xl bg-panel2/50 p-5">
                      <p className="text-sm text-dim">齐套率</p>
                      <p className="mt-2 text-4xl font-semibold tabular-nums">{kit.rate === null || kit.rate === undefined ? "暂无数据" : `${kit.rate}%`}</p>
                      <p className="mt-3 text-xs leading-5 text-faint">{kit.formula}</p>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <SectionMetric label="完全齐套" value={kit.sufficient} tone="ok" />
                      <SectionMetric label="缺料" value={kit.shortage} tone="danger" />
                      <SectionMetric label="未检查" value={kit.notChecked} tone="neutral" />
                    </div>
                  </>
                ) : (
                  <EmptyHint>齐套检查随生产工单使用，当前暂无工单可统计。</EmptyHint>
                )}
              </SubSection>

              <SubSection title="采购与供应" description="采购需求、延期明细与可见订单" error={data.procurement?.error} onRetry={load}>
                {hasProcurementData && procurement ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <SectionMetric label="延期采购明细" value={procurement.delayedItems} tone="danger" />
                      <SectionMetric label="可见采购订单" value={procurement.orders.length} tone="neutral" />
                    </div>
                    {procurement.mode === "RECEIVING_ONLY" && (
                      <div className="mt-4 rounded-lg bg-warn/10 px-4 py-3 text-sm text-warn">仓库视图仅显示收货执行所需字段，不展示采购价格。</div>
                    )}
                    <SectionLink href="/erp/purchase-demands" label="查看采购需求" />
                  </>
                ) : (
                  <EmptyHint>采购模块暂未产生数据——录入采购需求后，这里会显示需求与延期风险。</EmptyHint>
                )}
              </SubSection>

              <SubSection title="异常与提醒" description="待收货与近期作废提醒" error={data.alerts?.error} onRetry={load}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <SectionMetric label="在途采购单（待收货）" value={alerts?.pendingStockIn ?? 0} tone="warning" />
                  {alerts?.recentVoids !== undefined && <SectionMetric label="最近 30 天作废" value={alerts.recentVoids} tone="danger" />}
                </div>
              </SubSection>
            </div>
          )}
        </div>

        {/* 快捷操作 */}
        <section>
          <div className="mb-4">
            <h2 className="font-semibold">快捷操作</h2>
            <p className="mt-1 text-sm text-faint">仅展示当前角色视图所需入口</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {QUICK_ACTIONS[roleView].map((action) => {
              const Icon = action.icon;
              return (
                <button key={action.href + action.label} className="panel panel-hover flex items-center gap-4 p-4 text-left" onClick={() => navigate(action.href)}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brandhi">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{action.label}</p>
                    <p className="mt-1 text-xs text-faint">{action.description}</p>
                  </div>
                  <ArrowRight size={15} className="shrink-0 text-faint" />
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ title, value, valueText, icon, href, error }: {
  title: string;
  value?: number;
  valueText?: string;
  icon: React.ReactNode;
  href: string;
  error?: string;
}) {
  return (
    <button
      className="panel panel-hover flex items-center gap-4 p-5 text-left"
      onClick={() => navigate(href)}
      title={error || undefined}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brandhi">
        {icon}
      </div>
      <div className="min-w-0">
        {error ? (
          <p className="text-sm text-faint">{title}暂不可用</p>
        ) : (
          <>
            <p className="truncate text-2xl font-semibold tabular-nums">{valueText ?? (value ?? 0).toLocaleString()}</p>
            <p className="mt-0.5 text-xs text-faint">{title}</p>
          </>
        )}
      </div>
    </button>
  );
}

function Section({ title, description, error, onRetry, children }: {
  title: string; description: string; error?: string; onRetry: () => void; children: React.ReactNode;
}) {
  return (
    <div className="panel p-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-faint">{description}</p>
      {error ? <ErrorTip message={error} onRetry={onRetry} /> : <div className="mt-4">{children}</div>}
    </div>
  );
}

function SubSection({ title, description, error, onRetry, children }: {
  title: string; description: string; error?: string; onRetry: () => void; children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      <p className="mt-0.5 text-xs text-faint">{description}</p>
      {error ? <ErrorTip message={error} onRetry={onRetry} /> : <div className="mt-3">{children}</div>}
    </div>
  );
}

function SectionMetric({ label, value, tone }: { label: string; value: number; tone: "ok" | "warning" | "danger" | "neutral" }) {
  const toneClass = { ok: "text-ok", warning: "text-warn", danger: "text-bad", neutral: "" }[tone];
  return (
    <div className="rounded-xl bg-panel2/50 px-4 py-3">
      <p className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-dim">{label}</p>
    </div>
  );
}

function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <button className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brandhi hover:underline" onClick={() => navigate(href)}>
      {label}
      <ArrowRight size={14} />
    </button>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-panel2/50 px-4 py-3 text-sm leading-6 text-faint">{children}</div>
  );
}
