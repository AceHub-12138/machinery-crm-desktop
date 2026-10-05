import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api, getCachedUser } from "../../lib/api";
import { Pill, Spinner, Empty, ErrorTip, PageHeader, SearchSelect, notify, showToast } from "../../components/ui";
import { ERP_DEMAND_SOURCE, ERP_DEMAND_STATUS, demandRemaining } from "../../lib/erp";
import { date } from "../../lib/format";
import { navigate } from "../../lib/navigation";
import type { ErpMaterialRow, ErpPurchaseDemandRow, ErpSupplierRow } from "../../types";

const REPLENISHMENT_REASONS = ["安全库存补充", "常用物料备货", "长周期物料提前采购", "价格上涨前备货", "供应商停产风险", "售后备件", "临时备货", "其他"] as const;

/**
 * 采购需求：生产工单缺料、月度备件预测和备货需求统一汇总；
 * 勾选多项需求 + 选供应商 → 生成采购订单草稿（不会自动下单）。
 */
export default function PurchaseDemandsPage() {
  const role = getCachedUser()?.role;
  const canCreate = role === "SUPER_ADMIN" || role === "PURCHASE" || role === "WAREHOUSE";
  const canConvert = role === "SUPER_ADMIN" || role === "PURCHASE";

  const [rows, setRows] = useState<ErpPurchaseDemandRow[] | null>(null);
  const [materials, setMaterials] = useState<ErpMaterialRow[]>([]);
  const [suppliers, setSuppliers] = useState<ErpSupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // 新增备货需求
  const [form, setForm] = useState({ materialId: "", quantity: "", needByDate: "", stockPurpose: "", replenishmentReason: "安全库存补充" });
  const [creating, setCreating] = useState(false);

  // 转采购订单
  const [supplierId, setSupplierId] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [converting, setConverting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [demandData, materialData, supplierData] = await Promise.all([
        api<ErpPurchaseDemandRow[]>("/api/erp/purchase-demands"),
        api<ErpMaterialRow[]>("/api/erp/materials"),
        api<{ items: ErpSupplierRow[] }>("/api/erp/suppliers"),
      ]);
      setRows(Array.isArray(demandData) ? demandData : []);
      setMaterials(Array.isArray(materialData) ? materialData : []);
      setSuppliers(supplierData.items || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const materialMap = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);
  const selectable = useMemo(() => (rows || []).filter((row) => demandRemaining(row) > 0), [rows]);
  const selectedCount = Object.keys(selected).length;

  const toggle = (row: ErpPurchaseDemandRow, checked: boolean) => {
    setSelected((current) => {
      const next = { ...current };
      if (checked) next[row.id] = String(demandRemaining(row));
      else delete next[row.id];
      return next;
    });
  };

  const setAllocation = (row: ErpPurchaseDemandRow, value: string) => {
    setSelected((current) => ({ ...current, [row.id]: value }));
  };

  const createDemand = async () => {
    if (!form.materialId || !(Number(form.quantity) > 0) || !form.needByDate) return;
    setCreating(true);
    setError("");
    setMessage("");
    try {
      const created = await api<ErpPurchaseDemandRow>("/api/erp/purchase-demands", {
        method: "POST",
        body: { ...form, sourceType: "STOCK_REPLENISHMENT" },
      });
      setMessage(`采购需求 ${created.demandNo || ""} 已保存。`);
      notify("备货需求已保存");
      setForm((current) => ({ ...current, materialId: "", quantity: "", stockPurpose: "" }));
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const convert = async () => {
    const allocations = Object.entries(selected).map(([purchaseDemandId, quantity]) => ({ purchaseDemandId, quantity }));
    if (!supplierId || allocations.length === 0) {
      setError("请选择供应商和至少一项采购需求");
      return;
    }
    setConverting(true);
    setError("");
    setMessage("");
    try {
      const created = await api<{ id: string; orderNo: string }>("/api/erp/purchase-demands/convert", {
        method: "POST",
        body: { supplierId, allocations },
      });
      setSelected({});
      setSupplierId("");
      notify(`已生成采购订单草稿 ${created.orderNo || ""}`);
      await load();
      navigate(`/erp/purchase-orders/${created.id}`);
    } catch (err) {
      setError((err as Error).message);
      showToast((err as Error).message, "error");
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <PageHeader title="采购需求" sub="生产工单、月度备件预测和备货需求统一汇总；选择需求和供应商后，才生成采购订单草稿">
          <button className="btn-ghost !px-2.5" title="刷新" onClick={load}>
            {loading ? <Spinner className="!w-4 !h-4" /> : <RefreshCw size={15} />}
          </button>
        </PageHeader>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
        {canCreate && (
          <section className="panel p-4">
            <h2 className="text-sm font-semibold">新增备货需求</h2>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
              <SearchSelect
                value={form.materialId}
                onChange={(value) => setForm((current) => ({ ...current, materialId: value }))}
                options={[{ value: "", label: "请选择物料" }, ...materials.map((material) => ({ value: material.id, label: `${material.code} · ${material.name}`, sub: material.spec || undefined }))]}
                placeholder="请选择物料"
              />
              <input className="input" type="number" min="0.01" placeholder="备货数量" value={form.quantity} onChange={(e) => setForm((current) => ({ ...current, quantity: e.target.value }))} />
              <input className="input" type="date" aria-label="需要日期" value={form.needByDate} onChange={(e) => setForm((current) => ({ ...current, needByDate: e.target.value }))} />
              <input className="input" placeholder="备货用途" value={form.stockPurpose} onChange={(e) => setForm((current) => ({ ...current, stockPurpose: e.target.value }))} />
              <select className="input" aria-label="备货原因" value={form.replenishmentReason} onChange={(e) => setForm((current) => ({ ...current, replenishmentReason: e.target.value }))}>
                {REPLENISHMENT_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
              </select>
            </div>
            <button
              className="btn-brand mt-3"
              disabled={creating || !form.materialId || !(Number(form.quantity) > 0) || !form.needByDate}
              onClick={() => void createDemand()}
            >
              {creating ? <Spinner className="!h-4 !w-4" /> : "保存备货需求"}
            </button>
            <p className="mt-2 text-xs text-faint">预计可用量已满足需求时，平台会拒绝重复生成采购草稿。</p>
          </section>
        )}

        <section className="panel p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[240px] flex-1">
              <span className="label">本次采购供应商</span>
              <SearchSelect
                className="mt-1"
                value={supplierId}
                onChange={setSupplierId}
                options={[{ value: "", label: "请选择供应商" }, ...suppliers.filter((supplier) => supplier.isActive !== false).map((supplier) => ({ value: supplier.id, label: supplier.name }))]}
                placeholder="请选择供应商"
              />
            </label>
            {canConvert && (
              <button className="btn-brand" disabled={converting || !supplierId || selectedCount === 0} onClick={() => void convert()}>
                {converting ? <Spinner className="!h-4 !w-4" /> : `生成采购订单草稿（${selectedCount}）`}
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-faint">可合并选择多项需求；同一物料的多条需求会合并成一行明细，生成后可在采购订单草稿中调整单价和数量，不会自动下单。</p>
        </section>

        {error && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">{error}</p>}
        {message && <p className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-xs text-ok">{message}</p>}

        <section className="panel overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: "1080px" }}>
            <thead className="sticky top-0 bg-panel z-10">
              <tr>
                <th className="th !w-14 !text-center">选择</th>
                <th className="th">需求号</th>
                <th className="th">来源</th>
                <th className="th">物料</th>
                <th className="th !text-right">新增需求</th>
                <th className="th !text-right">建议采购</th>
                <th className="th !text-right">剩余可转</th>
                <th className="th !w-28">本次转采购单</th>
                <th className="th">需要日期</th>
                <th className="th">状态</th>
                <th className="th">用途 / 原因</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((row, index) => {
                const remaining = demandRemaining(row);
                return (
                  <tr key={row.id} className="row-hover fade-up" style={{ animationDelay: `${Math.min(index * 20, 300)}ms` }}>
                    <td className="td text-center">
                      <input type="checkbox" disabled={remaining <= 0} checked={selected[row.id] !== undefined} onChange={(e) => toggle(row, e.target.checked)} />
                    </td>
                    <td className="td mono text-xs">{row.demandNo || "—"}</td>
                    <td className="td">
                      <div>{ERP_DEMAND_SOURCE[row.sourceType] || row.sourceType}</div>
                      {row.sourceLabel && <div className="text-xs text-faint">{row.sourceLabel}</div>}
                    </td>
                    <td className="td">
                      <span className="font-medium">{row.material?.code}</span> {row.material?.name}
                    </td>
                    <td className="td text-right">{Number(row.requestedQuantity).toLocaleString()} {row.material?.unit}</td>
                    <td className="td text-right">{Number(row.suggestedQuantity || 0).toLocaleString()}</td>
                    <td className="td text-right font-medium">{remaining.toLocaleString()}</td>
                    <td className="td">
                      {selected[row.id] !== undefined ? (
                        <input
                          className="input !py-1 text-right"
                          type="number"
                          min="0.01"
                          max={remaining}
                          step="0.01"
                          value={selected[row.id]}
                          onChange={(e) => setAllocation(row, e.target.value)}
                        />
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="td text-xs text-dim">{row.needByDate ? date(row.needByDate) : "—"}</td>
                    <td className="td"><Pill tone={ERP_DEMAND_STATUS[row.status]?.tone || "text-dim bg-steel/25"}>{ERP_DEMAND_STATUS[row.status]?.label || row.status}</Pill></td>
                    <td className="td text-dim">{row.stockPurpose || row.replenishmentReason || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loading && !rows && <div className="py-16 flex justify-center"><Spinner /></div>}
          {!loading && error && !rows && <ErrorTip message={error} onRetry={load} />}
          {!loading && !error && rows && rows.length === 0 && <Empty text="暂无待转换的采购需求" />}
        </section>
      </div>
    </div>
  );
}
