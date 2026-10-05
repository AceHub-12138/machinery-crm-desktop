import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { api, getCachedUser } from "../../lib/api";
import { Pill, Spinner, Empty, ErrorTip, PageHeader, Sheet, SearchSelect, notify, showToast, Field, Dash } from "../../components/ui";
import { ERP_DELIVERY_RISK, ERP_DELIVERY_STATUS, ERP_DEMAND_SOURCE, ERP_SUPPLIER_PROGRESS } from "../../lib/erp";
import { date } from "../../lib/format";
import type { ErpDeliveryRow } from "../../types";

/** 供应商交期跟踪：按采购明细跟踪承诺、发货、分批到货与多来源分摊；实际到货以已确认入库单为准 */
export default function SupplierDeliveriesPage() {
  const role = getCachedUser()?.role;
  const canManage = role === "SUPER_ADMIN" || role === "PURCHASE";

  const [rows, setRows] = useState<ErpDeliveryRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [risk, setRisk] = useState("");
  const [due, setDue] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [action, setAction] = useState<null | { kind: "promise" | "follow-up" | "batch"; row: ErpDeliveryRow }>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ items: ErpDeliveryRow[] }>("/api/erp/supplier-deliveries", {
        query: { risk: risk || undefined, due: due || undefined, sourceType: sourceType || undefined },
      });
      setRows(data.items || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [risk, due, sourceType]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <PageHeader title="供应商交期跟踪" sub="按采购明细跟踪承诺、发货、分批到货及多来源数量分摊；实际到货数量以已确认入库单为准">
          <button className="btn-ghost !px-2.5" title="刷新" onClick={load}>
            {loading ? <Spinner className="!w-4 !h-4" /> : <RefreshCw size={15} />}
          </button>
        </PageHeader>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className="input !w-auto" value={risk} onChange={(e) => setRisk(e.target.value)}>
            <option value="">全部风险</option>
            {Object.entries(ERP_DELIVERY_RISK).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
          <select className="input !w-auto" value={due} onChange={(e) => setDue(e.target.value)}>
            <option value="">全部交期</option>
            <option value="today">今日到期</option>
            <option value="3">3天内到期</option>
            <option value="7">7天内到期</option>
            <option value="overdue">已逾期</option>
          </select>
          <select className="input !w-auto" value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
            <option value="">全部来源</option>
            {Object.entries(ERP_DEMAND_SOURCE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: "1480px" }}>
            <thead className="sticky top-0 bg-panel z-10">
              <tr>
                <th className="th">采购单</th>
                <th className="th">供应商</th>
                <th className="th">物料</th>
                <th className="th !text-right">采购 / 到货 / 未到</th>
                <th className="th">需求到货</th>
                <th className="th">首次承诺</th>
                <th className="th">最新承诺</th>
                <th className="th">实际发货</th>
                <th className="th !text-right">交期天数</th>
                <th className="th">风险</th>
                <th className="th">影响生产</th>
                <th className="th">最近跟进</th>
                <th className="th">状态</th>
                {canManage && <th className="th !text-center">操作</th>}
              </tr>
            </thead>
            <tbody>
              {rows?.map((row, index) => {
                const expanded = expandedId === row.id;
                return (
                  <DeliveryRowBlock
                    key={row.id}
                    row={row}
                    index={index}
                    expanded={expanded}
                    canManage={canManage}
                    onToggle={() => setExpandedId(expanded ? null : row.id)}
                    onAction={setAction}
                  />
                );
              })}
            </tbody>
          </table>
          {loading && !rows && <div className="py-16 flex justify-center"><Spinner /></div>}
          {!loading && error && <ErrorTip message={error} onRetry={load} />}
          {!loading && !error && rows && rows.length === 0 && <Empty text="暂无交期跟踪明细（仅显示已下单未收满的采购明细）" />}
        </div>
      </div>

      {action?.kind === "promise" && (
        <PromiseSheet row={action.row} onClose={() => setAction(null)} onDone={() => { setAction(null); void load(); }} />
      )}
      {action?.kind === "follow-up" && (
        <FollowUpSheet row={action.row} onClose={() => setAction(null)} onDone={() => { setAction(null); void load(); }} />
      )}
      {action?.kind === "batch" && (
        <BatchSheet row={action.row} onClose={() => setAction(null)} onDone={() => { setAction(null); void load(); }} />
      )}
    </div>
  );
}

function DeliveryRowBlock({
  row,
  index,
  expanded,
  canManage,
  onToggle,
  onAction,
}: {
  row: ErpDeliveryRow;
  index: number;
  expanded: boolean;
  canManage: boolean;
  onToggle: () => void;
  onAction: (action: { kind: "promise" | "follow-up" | "batch"; row: ErpDeliveryRow }) => void;
}) {
  const risk = row.risk;
  return (
    <>
      <tr className={`row-hover fade-up ${expanded ? "!bg-brand/6" : ""}`} style={{ animationDelay: `${Math.min(index * 20, 300)}ms` }}>
        <td className="td mono text-xs">{row.orderNo || "—"}</td>
        <td className="td text-dim">{row.supplier || "—"}</td>
        <td className="td">
          <span className="mono text-xs">{row.materialCodeSnapshot}</span>{" "}
          <button className="font-medium hover:text-brandhi" title="查看分摊 / 批次" onClick={onToggle}>
            {row.materialNameSnapshot}
          </button>
        </td>
        <td className="td text-right">{Number(row.quantity)} / {Number(row.receivedQuantity || 0)} / {row.remainingQuantity ?? Math.max(Number(row.quantity) - Number(row.receivedQuantity || 0), 0)}</td>
        <td className="td text-xs text-dim">{row.needArrivalDate ? date(row.needArrivalDate) : "—"}</td>
        <td className="td text-xs text-dim">{row.firstPromisedDate ? date(row.firstPromisedDate) : "—"}</td>
        <td className="td text-xs text-dim">
          {row.latestPromisedDate ? date(row.latestPromisedDate) : "—"}
          <div className="text-faint">变更 {Math.max((row.promiseHistory?.length || 1) - 1, 0)} 次</div>
        </td>
        <td className="td text-xs text-dim">{row.actualShipDate ? date(row.actualShipDate) : "—"}</td>
        <td className="td text-right">{risk?.days ?? "—"}</td>
        <td className="td">{risk ? <Pill tone={ERP_DELIVERY_RISK[risk.level]?.tone || "text-dim bg-steel/25"}>{ERP_DELIVERY_RISK[risk.level]?.label || risk.level}</Pill> : <Dash />}</td>
        <td className="td text-xs">{risk?.affectsProduction ? <span className="text-bad">可能影响</span> : <span className="text-faint">否</span>}</td>
        <td className="td text-xs text-dim">
          {row.lastFollowUp ? `${ERP_SUPPLIER_PROGRESS[row.lastFollowUp.progress || ""] || row.lastFollowUp.progress} ${row.lastFollowUp.followedAt ? date(row.lastFollowUp.followedAt) : ""}` : "未跟进"}
        </td>
        <td className="td"><Pill tone={ERP_DELIVERY_STATUS[row.calculatedDeliveryStatus || ""]?.tone || "text-dim bg-steel/25"}>{ERP_DELIVERY_STATUS[row.calculatedDeliveryStatus || ""]?.label || row.calculatedDeliveryStatus || "—"}</Pill></td>
        {canManage && (
          <td className="td">
            <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
              <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => onAction({ kind: "promise", row })}>更新承诺</button>
              <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => onAction({ kind: "follow-up", row })}>新增跟进</button>
              <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => onAction({ kind: "batch", row })}>计划批次</button>
            </div>
          </td>
        )}
      </tr>
      {expanded && (
        <tr>
          <td colSpan={canManage ? 15 : 14} className="td !bg-panel2/60">
            <div className="grid grid-cols-1 gap-4 py-1 md:grid-cols-2">
              <div>
                <span className="label">需求来源分摊</span>
                {(row.demandSources?.length ?? 0) > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-xs text-dim">
                    {row.demandSources!.map((source) => (
                      <li key={source.id}>
                        {source.purchaseDemand?.sourceLabel || ERP_DEMAND_SOURCE[row.sourceTypes?.[0] || ""] || "手工采购"}：{Number(source.allocatedQuantity).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-faint">{(row.sourceTypes?.length ?? 0) > 0 ? row.sourceTypes!.map((type) => ERP_DEMAND_SOURCE[type] || type).join("、") : "手工采购"}</p>
                )}
              </div>
              <div>
                <span className="label">计划批次</span>
                {(row.deliveryBatches?.length ?? 0) > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-xs text-dim">
                    {row.deliveryBatches!.map((batch) => (
                      <li key={batch.id}>
                        计划 {Number(batch.plannedQuantity).toLocaleString()}{batch.plannedArrivalDate ? ` · ${date(batch.plannedArrivalDate)}` : ""}{batch.shippedQuantity ? ` · 已发 ${Number(batch.shippedQuantity).toLocaleString()}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-faint">暂无批次计划</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ---------------- 三个操作表单（替代平台的 prompt 弹窗） ---------------- */

function PromiseSheet({ row, onClose, onDone }: { row: ErpDeliveryRow; onClose: () => void; onDone: () => void }) {
  const [promisedDate, setPromisedDate] = useState(row.latestPromisedDate?.slice(0, 10) || "");
  const [supplierReason, setSupplierReason] = useState("");
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!promisedDate) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/erp/supplier-deliveries/${row.id}/promise-date`, {
        method: "POST",
        body: { promisedDate, supplierReason: supplierReason || "采购跟进更新", remark },
      });
      notify("承诺日期已更新");
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Sheet title="更新承诺日期" subtitle={`${row.orderNo || ""} · ${row.materialNameSnapshot || ""}`} onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="label">供应商最新承诺日期 *</span>
          <input className="input mt-1" type="date" value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">供应商反馈原因</span>
          <input className="input mt-1" value={supplierReason} onChange={(e) => setSupplierReason(e.target.value)} placeholder="如：原料延迟、换产安排" />
        </label>
        <label className="block">
          <span className="label">备注</span>
          <input className="input mt-1" value={remark} onChange={(e) => setRemark(e.target.value)} />
        </label>
        <p className="rounded-lg bg-panel2/60 px-3 py-2 text-xs text-faint">承诺晚于需求到货日期会标记为「可能影响生产」，并写入承诺变更历史。</p>
        {error && <p className="text-xs text-bad">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-brand" disabled={saving || !promisedDate} onClick={() => void save()}>
            {saving ? <Spinner className="!h-4 !w-4" /> : "保存"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function FollowUpSheet({ row, onClose, onDone }: { row: ErpDeliveryRow; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    progress: row.lastFollowUp?.progress && ERP_SUPPLIER_PROGRESS[row.lastFollowUp.progress] ? row.lastFollowUp.progress : "IN_PRODUCTION",
    supplierContact: "",
    contactMethod: "",
    completionPercent: "",
    estimatedShipDate: "",
    hasDelayRisk: false,
    riskReason: "",
    remark: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await api(`/api/erp/supplier-deliveries/${row.id}/follow-ups`, {
        method: "POST",
        body: {
          progress: form.progress,
          supplierContact: form.supplierContact || undefined,
          contactMethod: form.contactMethod || undefined,
          completionPercent: form.completionPercent === "" ? undefined : Number(form.completionPercent),
          estimatedShipDate: form.estimatedShipDate || undefined,
          hasDelayRisk: form.hasDelayRisk,
          riskReason: form.riskReason || undefined,
          remark: form.remark || undefined,
        },
      });
      notify("跟进记录已保存");
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Sheet title="新增跟进" subtitle={`${row.orderNo || ""} · ${row.materialNameSnapshot || ""}`} onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block">
          <span className="label">当前进度 *</span>
          <select className="input mt-1" value={form.progress} onChange={(e) => set("progress", e.target.value)}>
            {Object.entries(ERP_SUPPLIER_PROGRESS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">完成百分比（0–100）</span>
          <input className="input mt-1" type="number" min="0" max="100" step="1" value={form.completionPercent} onChange={(e) => set("completionPercent", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">供应商联系人</span>
          <input className="input mt-1" value={form.supplierContact} onChange={(e) => set("supplierContact", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">联系方式</span>
          <input className="input mt-1" value={form.contactMethod} onChange={(e) => set("contactMethod", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">预计发货日期</span>
          <input className="input mt-1" type="date" value={form.estimatedShipDate} onChange={(e) => set("estimatedShipDate", e.target.value)} />
        </label>
        <label className="flex items-center gap-2 pt-6 text-sm text-dim">
          <input type="checkbox" checked={form.hasDelayRisk} onChange={(e) => set("hasDelayRisk", e.target.checked)} />
          存在延期风险
        </label>
        {form.hasDelayRisk && (
          <label className="block md:col-span-2">
            <span className="label">风险原因</span>
            <input className="input mt-1" value={form.riskReason} onChange={(e) => set("riskReason", e.target.value)} />
          </label>
        )}
        <label className="block md:col-span-2">
          <span className="label">跟进备注</span>
          <textarea className="input mt-1" rows={2} value={form.remark} onChange={(e) => set("remark", e.target.value)} />
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>取消</button>
        <button className="btn-brand" disabled={saving} onClick={() => void save()}>
          {saving ? <Spinner className="!h-4 !w-4" /> : "保存"}
        </button>
      </div>
    </Sheet>
  );
}

function BatchSheet({ row, onClose, onDone }: { row: ErpDeliveryRow; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    plannedQuantity: "",
    plannedArrivalDate: "",
    shippedQuantity: "",
    actualShipDate: "",
    trackingNo: "",
    remark: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const remaining = row.remainingQuantity ?? Math.max(Number(row.quantity) - Number(row.receivedQuantity || 0), 0);

  const save = async () => {
    if (!(Number(form.plannedQuantity) > 0)) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/erp/supplier-deliveries/${row.id}/batches`, {
        method: "POST",
        body: {
          plannedQuantity: form.plannedQuantity,
          plannedArrivalDate: form.plannedArrivalDate || undefined,
          shippedQuantity: form.shippedQuantity === "" ? undefined : Number(form.shippedQuantity),
          actualShipDate: form.actualShipDate || undefined,
          trackingNo: form.trackingNo || undefined,
          remark: form.remark || undefined,
        },
      });
      notify("批次计划已保存");
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Sheet title="计划批次" subtitle={`${row.orderNo || ""} · ${row.materialNameSnapshot || ""} · 未到 ${Number(remaining).toLocaleString()}`} onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block">
          <span className="label">本批计划到货数量 *</span>
          <input className="input mt-1" type="number" min="0.01" value={form.plannedQuantity} onChange={(e) => set("plannedQuantity", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">本批计划到货日期</span>
          <input className="input mt-1" type="date" value={form.plannedArrivalDate} onChange={(e) => set("plannedArrivalDate", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">实际发货数量</span>
          <input className="input mt-1" type="number" min="0" value={form.shippedQuantity} onChange={(e) => set("shippedQuantity", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">实际发货日期</span>
          <input className="input mt-1" type="date" value={form.actualShipDate} onChange={(e) => set("actualShipDate", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">物流单号</span>
          <input className="input mt-1" value={form.trackingNo} onChange={(e) => set("trackingNo", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">备注</span>
          <input className="input mt-1" value={form.remark} onChange={(e) => set("remark", e.target.value)} />
        </label>
      </div>
      <p className="mt-2 rounded-lg bg-panel2/60 px-3 py-2 text-xs leading-5 text-faint">
        各批次计划数量合计不能超过采购数量；填写实际发货数量时必须同时填写实际发货日期；实际到货数量以采购入库登记为准，不能手工填写。
      </p>
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>取消</button>
        <button className="btn-brand" disabled={saving || !(Number(form.plannedQuantity) > 0)} onClick={() => void save()}>
          {saving ? <Spinner className="!h-4 !w-4" /> : "保存"}
        </button>
      </div>
    </Sheet>
  );
}
