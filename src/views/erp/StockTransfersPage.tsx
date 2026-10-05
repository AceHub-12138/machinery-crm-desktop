import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api, getCachedUser } from "../../lib/api";
import { Spinner, Empty, ErrorTip, PageHeader, SearchSelect, ConfirmDialog, notify, showToast } from "../../components/ui";
import { dateTime } from "../../lib/format";
import type { ErpMaterialRow, ErpStockTransferRow, ErpWarehouseRow } from "../../types";

/** 库存调拨：确认即同时生成调出/调入流水，金额按调出仓移动加权平均结转 */
export default function StockTransfersPage() {
  const canEdit = getCachedUser()?.role === "SUPER_ADMIN" || getCachedUser()?.role === "WAREHOUSE";
  const [warehouses, setWarehouses] = useState<ErpWarehouseRow[]>([]);
  const [materials, setMaterials] = useState<ErpMaterialRow[]>([]);
  const [rows, setRows] = useState<ErpStockTransferRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [warehouseData, materialData, transferData] = await Promise.all([
        api<ErpWarehouseRow[]>("/api/erp/warehouses"),
        api<ErpMaterialRow[]>("/api/erp/materials"),
        api<ErpStockTransferRow[]>("/api/erp/stock-transfers"),
      ]);
      setWarehouses(Array.isArray(warehouseData) ? warehouseData : []);
      setMaterials(Array.isArray(materialData) ? materialData : []);
      setRows(Array.isArray(transferData) ? transferData : []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const warehouseName = (id: string) => warehouses.find((warehouse) => warehouse.id === id)?.name || "—";

  const submit = async () => {
    setSaving(true);
    try {
      const created = await api<ErpStockTransferRow>("/api/erp/stock-transfers", {
        method: "POST",
        body: {
          fromWarehouseId,
          toWarehouseId,
          reason,
          items: [{ materialId, quantity }],
        },
      });
      notify(`调拨成功：${created.transferNo || ""}`);
      setMaterialId(""); setQuantity(""); setReason("");
      setConfirming(false);
      await load();
    } catch (err) {
      showToast((err as Error).message, "error");
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  const warehouseOptions = warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <PageHeader title="库存调拨" sub="确认即同时生成调出、调入流水，并把两个仓库的相关工单加入齐套复检队列">
          <button className="btn-ghost !px-2.5" title="刷新" onClick={load}>
            {loading ? <Spinner className="!w-4 !h-4" /> : <RefreshCw size={15} />}
          </button>
        </PageHeader>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {canEdit && (
          <div className="panel mb-4 p-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
              <SearchSelect
                value={fromWarehouseId}
                onChange={(value) => { setFromWarehouseId(value); if (value === toWarehouseId) setToWarehouseId(""); }}
                options={[{ value: "", label: "调出仓" }, ...warehouseOptions]}
                placeholder="调出仓"
              />
              <SearchSelect
                value={toWarehouseId}
                onChange={(value) => { setToWarehouseId(value); if (value === fromWarehouseId) setFromWarehouseId(""); }}
                options={[{ value: "", label: "调入仓" }, ...warehouseOptions]}
                placeholder="调入仓"
              />
              <SearchSelect
                value={materialId}
                onChange={setMaterialId}
                options={[{ value: "", label: "请选择物料" }, ...materials.map((material) => ({ value: material.id, label: `${material.code} · ${material.name}`, sub: material.spec || undefined }))]}
                placeholder="请选择物料"
              />
              <input className="input" type="number" min="0.01" placeholder="数量" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              <input className="input" placeholder="调拨原因" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <button
              className="btn-brand mt-3"
              disabled={!fromWarehouseId || !toWarehouseId || fromWarehouseId === toWarehouseId || !materialId || !(Number(quantity) > 0)}
              onClick={() => setConfirming(true)}
            >
              确认调拨
            </button>
            {fromWarehouseId && toWarehouseId && fromWarehouseId === toWarehouseId && (
              <p className="mt-2 text-xs text-bad">调出仓与调入仓不能相同</p>
            )}
          </div>
        )}

        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: "760px" }}>
            <thead className="sticky top-0 bg-panel z-10">
              <tr>
                <th className="th">调拨单号</th>
                <th className="th">调出仓</th>
                <th className="th">调入仓</th>
                <th className="th">原因</th>
                <th className="th !text-right">明细数</th>
                <th className="th">时间</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((row, index) => (
                <tr key={row.id} className="row-hover fade-up" style={{ animationDelay: `${Math.min(index * 20, 300)}ms` }}>
                  <td className="td mono text-xs">{row.transferNo}</td>
                  <td className="td text-dim">{warehouseName(row.fromWarehouseId)}</td>
                  <td className="td text-dim">{warehouseName(row.toWarehouseId)}</td>
                  <td className="td text-dim">{row.reason || "—"}</td>
                  <td className="td text-right">{row.items?.length || 0}</td>
                  <td className="td text-xs text-dim">{dateTime(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && !rows && <div className="py-16 flex justify-center"><Spinner /></div>}
          {!loading && error && <ErrorTip message={error} onRetry={load} />}
          {!loading && !error && rows && rows.length === 0 && <Empty text="暂无调拨记录" />}
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title="确认调拨"
          message={`将把物料从「${warehouseName(fromWarehouseId)}」调拨到「${warehouseName(toWarehouseId)}」，数量 ${quantity}。金额按调出仓移动加权平均结转，确认后不可撤销。`}
          confirmText="确认调拨"
          busy={saving}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void submit()}
        />
      )}
    </div>
  );
}
