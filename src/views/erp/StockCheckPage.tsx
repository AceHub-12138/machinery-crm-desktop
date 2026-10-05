import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, Info, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api, getCachedUser } from "../../lib/api";
import { Pill, Spinner, Empty, ErrorTip, PageHeader, Sheet, ConfirmDialog, Segmented, SearchSelect, notify, showToast, Field, Dash } from "../../components/ui";
import { ERP_STOCK_CHECK_STATUS } from "../../lib/erp";
import { date, dateTime } from "../../lib/format";
import type { ErpInventoryRow, ErpStockCheckItemRow, ErpStockCheckRow, ErpWarehouseRow } from "../../types";

/** 盘点单：选仓拉账面快照 → 创建草稿 → 录实盘/差异原因 → 提交（不可逆，自动调库存写流水） */
export default function StockCheckPage() {
  const canEdit = getCachedUser()?.role === "SUPER_ADMIN" || getCachedUser()?.role === "WAREHOUSE";
  const [tab, setTab] = useState<"history" | "form">("history");

  // 新增草稿
  const [warehouses, setWarehouses] = useState<ErpWarehouseRow[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [remark, setRemark] = useState("");
  const [snapshot, setSnapshot] = useState<ErpInventoryRow[]>([]);
  const [creating, setCreating] = useState(false);

  // 历史
  const [rows, setRows] = useState<ErpStockCheckRow[] | null>(null);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [filterWarehouse, setFilterWarehouse] = useState("");

  // 详情（草稿可编辑实盘）
  const [detail, setDetail] = useState<ErpStockCheckRow | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ErpStockCheckRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api<ErpWarehouseRow[]>("/api/erp/warehouses", { query: { onlyActive: "1" } })
      .then((data) => setWarehouses(Array.isArray(data) ? data : []))
      .catch(() => setWarehouses([]));
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const data = await api<{ items: ErpStockCheckRow[]; pagination?: typeof pagination }>("/api/erp/stock-checks", {
        query: { warehouseId: filterWarehouse || undefined, page: String(page), pageSize: "20" },
      });
      setRows(data.items || []);
      setPagination(data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 0 });
    } catch (err) {
      setListError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filterWarehouse, page]);

  useEffect(() => {
    if (tab !== "history") return;
    void loadHistory();
  }, [tab, loadHistory, refreshKey]);

  const selectWarehouseForSnapshot = async (wid: string) => {
    setWarehouseId(wid);
    setSnapshot([]);
    if (!wid) return;
    try {
      const data = await api<{ items: ErpInventoryRow[] }>("/api/erp/inventory", { query: { warehouseId: wid, pageSize: "100" } });
      setSnapshot(data.items || []);
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  };

  const createDraft = async () => {
    if (!warehouseId || snapshot.length === 0) return;
    setCreating(true);
    try {
      const created = await api<ErpStockCheckRow>("/api/erp/stock-checks", {
        method: "POST",
        body: {
          warehouseId,
          remark,
          checkDate: new Date().toISOString(),
          items: snapshot.map((inv) => ({ materialId: inv.materialId, bookQty: String(inv.quantity) })),
        },
      });
      notify(`盘点草稿已创建：${created.batchNo || ""}`);
      setWarehouseId(""); setRemark(""); setSnapshot([]);
      setRefreshKey((value) => value + 1);
      setTab("history");
      setDetail(created);
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setCreating(false);
    }
  };

  const openDetail = async (id: string) => {
    try {
      const data = await api<ErpStockCheckRow>(`/api/erp/stock-checks/${id}`);
      setDetail(data);
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  };

  const updateDetailItem = (itemId: string, patch: Partial<ErpStockCheckItemRow>) => {
    setDetail((current) => {
      if (!current) return current;
      return { ...current, items: (current.items || []).map((item) => (item.id === itemId ? { ...item, ...patch } : item)) };
    });
  };

  const submitCheck = async () => {
    if (!detail) return;
    setSubmitting(true);
    try {
      const submitted = await api<ErpStockCheckRow>(`/api/erp/stock-checks/${detail.id}`, {
        method: "PUT",
        body: {
          items: (detail.items || []).map((item) => ({
            id: item.id,
            actualQty: item.actualQty !== null && item.actualQty !== undefined && item.actualQty !== "" ? String(item.actualQty) : String(item.bookQty),
            reason: item.reason || "",
          })),
        },
      });
      notify("盘点已提交，库存已按差异调整");
      setDetail(submitted);
      setShowSubmitConfirm(false);
      setRefreshKey((value) => value + 1);
      await loadHistory();
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <PageHeader title="盘点单" sub="创建草稿后按实盘录入差异，提交后自动调整库存并生成盘点调整流水，不可撤销">
          {canEdit && (
            <button className="btn-brand" onClick={() => setTab("form")}>
              <Plus size={16} />
              新增盘点
            </button>
          )}
          <button className="btn-ghost !px-2.5" title="刷新" onClick={loadHistory}>
            {loading ? <Spinner className="!w-4 !h-4" /> : <RefreshCw size={15} />}
          </button>
        </PageHeader>
        <div className="mt-3">
          <Segmented
            options={[{ value: "history" as const, label: "盘点记录" }, { value: "form" as const, label: "新增盘点" }]}
            value={tab}
            onChange={(next) => { if (next === "form" && !canEdit) return; setTab(next); }}
          />
        </div>
      </div>

      {tab === "form" && canEdit && (
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="panel space-y-4 p-5">
            <div className="rounded-lg border border-brand/30 bg-brand/8 px-3.5 py-3 text-xs leading-5">
              <p className="flex items-center gap-1.5 font-medium"><Info size={13} />使用说明</p>
              <ol className="mt-1.5 grid list-decimal gap-0.5 pl-4 md:grid-cols-2">
                <li>选择仓库后自动读取当前库存作为账面数量。</li>
                <li>创建草稿后，在盘点单详情中录入实盘数量与差异原因。</li>
                <li>实盘大于账面为盘盈，小于账面为盘亏。</li>
                <li>提交盘点后按差异自动调整库存，已完成盘点单不能再修改。</li>
              </ol>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block">
                <span className="label">仓库 *</span>
                <SearchSelect
                  className="mt-1"
                  value={warehouseId}
                  onChange={(value) => void selectWarehouseForSnapshot(value)}
                  options={[{ value: "", label: "请选择仓库" }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
                  placeholder="请选择仓库"
                />
              </label>
              <label className="block">
                <span className="label">备注</span>
                <input className="input mt-1" value={remark} onChange={(e) => setRemark(e.target.value)} />
              </label>
            </div>

            {snapshot.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-faint">以下为当前库存快照（最多 100 项），创建草稿后再录入实盘数量。</p>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-line">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 bg-panel">
                      <tr>
                        <th className="th">物料编码</th>
                        <th className="th">名称</th>
                        <th className="th !text-right">账面数量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.map((inv) => (
                        <tr key={inv.id} className="row-hover">
                          <td className="td mono text-xs">{inv.material?.code}</td>
                          <td className="td">{inv.material?.name}</td>
                          <td className="td text-right">{Number(inv.quantity).toLocaleString()} {inv.material?.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setTab("history")}>取消</button>
              <button className="btn-brand" disabled={creating || !warehouseId || snapshot.length === 0} onClick={() => void createDraft()}>
                {creating ? <Spinner className="!h-4 !w-4" /> : "创建草稿"}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pb-3">
            <div className="panel flex flex-wrap items-center gap-2 p-3">
              <SearchSelect
                className="!w-36"
                value={filterWarehouse}
                onChange={(value) => { setFilterWarehouse(value); setPage(1); }}
                options={[{ value: "", label: "全部仓库" }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
                placeholder="全部仓库"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-4">
            <div className="panel overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: "760px" }}>
                <thead className="sticky top-0 bg-panel z-10">
                  <tr>
                    <th className="th">单号</th>
                    <th className="th">仓库</th>
                    <th className="th">状态</th>
                    <th className="th !text-right">明细数</th>
                    <th className="th">盘点日期</th>
                    <th className="th !text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows?.map((row, index) => (
                    <tr key={row.id} className="row-hover fade-up" style={{ animationDelay: `${Math.min(index * 20, 300)}ms` }}>
                      <td className="td mono text-xs">{row.batchNo}</td>
                      <td className="td text-dim">{row.warehouse?.name}</td>
                      <td className="td"><Pill tone={ERP_STOCK_CHECK_STATUS[row.status]?.tone || "text-dim bg-steel/25"}>{ERP_STOCK_CHECK_STATUS[row.status]?.label || row.status}</Pill></td>
                      <td className="td text-right">{row.items?.length || 0} 项</td>
                      <td className="td text-xs text-dim">{row.checkDate ? date(row.checkDate) : "—"}</td>
                      <td className="td">
                        <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                          <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => void openDetail(row.id)}>{row.status === "DRAFT" ? "修改" : "查看"}</button>
                          <button
                            className="btn-ghost !px-2 !py-1 text-xs !text-bad"
                            disabled={row.status !== "DRAFT"}
                            title={row.status === "DRAFT" ? "删除盘点草稿" : "已完成盘点单不能删除"}
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 size={12} />删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {loading && !rows && <div className="py-16 flex justify-center"><Spinner /></div>}
              {!loading && listError && <ErrorTip message={listError} onRetry={loadHistory} />}
              {!loading && !listError && rows && rows.length === 0 && <Empty text="暂无盘点记录" />}
            </div>

            {pagination.totalPages > 1 && (
              <div className="mt-3 flex items-center justify-center gap-3 text-xs text-faint">
                <button className="btn-ghost !py-1 text-xs" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</button>
                <span>第 {page} / {pagination.totalPages} 页（共 {pagination.total} 条）</span>
                <button className="btn-ghost !py-1 text-xs" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}>下一页</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 详情/工作流 */}
      {detail && (
        <Sheet
          title={`盘点单 - ${detail.batchNo}`}
          subtitle={detail.status === "DRAFT" ? "草稿：录入实盘数量与差异原因后提交" : "已完成盘点单不允许修改"}
          size="wide"
          onClose={() => setDetail(null)}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
              <Field label="仓库">{detail.warehouse?.name || <Dash />}</Field>
              <Field label="盘点日期">{detail.checkDate ? date(detail.checkDate) : <Dash />}</Field>
              <Field label="状态">{ERP_STOCK_CHECK_STATUS[detail.status]?.label || detail.status}</Field>
              <Field label="备注">{detail.remark || <Dash />}</Field>
              <Field label="创建时间">{detail.createdAt ? dateTime(detail.createdAt) : <Dash />}</Field>
            </div>

            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full border-collapse text-sm" style={{ minWidth: "680px" }}>
                <thead>
                  <tr>
                    <th className="th">物料</th>
                    <th className="th !text-right">账面数量</th>
                    <th className="th !text-right">实盘数量</th>
                    <th className="th !text-right">差异</th>
                    <th className="th">原因</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items?.map((item) => {
                    const diff = item.diffQty !== null && item.diffQty !== undefined ? Number(item.diffQty) : null;
                    const actualStr = item.actualQty !== null && item.actualQty !== undefined ? String(item.actualQty) : "";
                    const editable = detail.status === "DRAFT" && canEdit;
                    return (
                      <tr key={item.id} className={`row-hover ${diff !== null && diff !== 0 ? "!bg-warn/8" : ""}`}>
                        <td className="td">
                          <div className="font-medium">{item.material?.name}</div>
                          <div className="text-xs text-faint">{item.material?.code}</div>
                        </td>
                        <td className="td text-right">{Number(item.bookQty).toLocaleString()} {item.material?.unit}</td>
                        <td className="td text-right">
                          {editable ? (
                            <input
                              className="input !w-24 !py-1 text-right"
                              type="number"
                              value={actualStr}
                              onChange={(e) => updateDetailItem(item.id, { actualQty: e.target.value })}
                            />
                          ) : (
                            actualStr !== "" ? `${Number(actualStr).toLocaleString()} ${item.material?.unit || ""}` : "—"
                          )}
                        </td>
                        <td className={`td text-right font-medium ${diff !== null && diff > 0 ? "text-ok" : diff !== null && diff < 0 ? "text-bad" : "text-faint"}`}>
                          {diff !== null ? (diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()) : "—"}
                        </td>
                        <td className="td">
                          {editable ? (
                            <input
                              className="input !py-1"
                              value={item.reason || ""}
                              onChange={(e) => updateDetailItem(item.id, { reason: e.target.value })}
                              placeholder="差异原因"
                            />
                          ) : (
                            item.reason || "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setDetail(null)}>关闭</button>
              {detail.status === "DRAFT" && canEdit && (
                <button className="btn-brand" onClick={() => setShowSubmitConfirm(true)}>
                  <CheckCircle size={15} />
                  提交盘点
                </button>
              )}
            </div>
          </div>
        </Sheet>
      )}

      {/* 提交确认（不可撤销） */}
      {showSubmitConfirm && detail && (
        <ConfirmDialog
          title="提交盘点单"
          message="提交后将按差异自动调整库存并生成盘点流水，不可撤销。实盘留空的物料按账面数量处理。确定提交？"
          confirmText="确认提交"
          busy={submitting}
          onCancel={() => setShowSubmitConfirm(false)}
          onConfirm={() => void submitCheck()}
        />
      )}

      {/* 删除草稿 */}
      {deleteTarget && (
        <ConfirmDialog
          title={deleteTarget.status === "DRAFT" ? "删除盘点草稿" : "不能删除已完成的盘点单"}
          message={
            deleteTarget.status === "DRAFT"
              ? `确定删除盘点草稿「${deleteTarget.batchNo}」吗？草稿未影响库存。`
              : "已完成盘点单不能删除，如需纠错请重新创建盘点单或走管理员纠错流程。"
          }
          confirmText={deleteTarget.status === "DRAFT" ? "删除" : "知道了"}
          danger={deleteTarget.status === "DRAFT"}
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void (async () => {
            if (deleteTarget.status !== "DRAFT") {
              setDeleteTarget(null);
              return;
            }
            setDeleting(true);
            try {
              await api(`/api/erp/stock-checks/${deleteTarget.id}`, { method: "DELETE" });
              notify("盘点草稿已删除");
              setDeleteTarget(null);
              if (detail?.id === deleteTarget.id) setDetail(null);
              setRefreshKey((value) => value + 1);
              await loadHistory();
            } catch (err) {
              showToast((err as Error).message, "error");
            } finally {
              setDeleting(false);
            }
          })()}
        />
      )}
    </div>
  );
}
