import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Link2Off, Printer, RefreshCw, Search, Trash2 } from "lucide-react";
import { api, getCachedUser } from "../../lib/api";
import { Pill, Spinner, Empty, ErrorTip, PageHeader, Sheet, ConfirmDialog, Segmented, SearchSelect, notify, showToast, Field, Dash } from "../../components/ui";
import { ERP_MOVEMENT_TYPE, ERP_STOCK_IN_STATUS, ERP_STOCK_IN_TYPE, collectPrintRows, isValidVoidReason, sumLineAmounts } from "../../lib/erp";
import { date, dateTime, money } from "../../lib/format";
import { navigate } from "../../lib/navigation";
import { ErpPrintArea, type ErpPrintContent } from "./print-sheet";
import { ErpDocumentAttachments, PendingErpAttachments, uploadErpAttachmentFiles } from "../../components/erp-attachments";
import type { ErpMaterialRow, ErpPurchaseOrderForStockIn, ErpStockInRow, ErpWarehouseRow } from "../../types";

interface CreatorOption { id: string; name?: string | null }

interface FormItem {
  materialId: string;
  quantity: string;
  unitPrice: string;
  purchaseOrderItemId?: string;
  maxQuantity?: number;
}

/** 入库单：新增（含采购入库联动预填）+ 历史 + 详情（作废冲减/流水/附件）+ 纠错作废 + 撤销采购关联 */
export default function StockInPage({ initialFilters }: { initialFilters?: Record<string, string | undefined> }) {
  const purchaseOrderIdFromLink = initialFilters?.purchaseOrderId || "";
  const canEdit = getCachedUser()?.role === "SUPER_ADMIN" || getCachedUser()?.role === "WAREHOUSE";

  const [tab, setTab] = useState<"history" | "form">(purchaseOrderIdFromLink ? "form" : "history");
  const [formError, setFormError] = useState("");
  const [purchaseSource, setPurchaseSource] = useState<ErpPurchaseOrderForStockIn | null>(null);

  // 新增表单
  const [warehouses, setWarehouses] = useState<ErpWarehouseRow[]>([]);
  const [materials, setMaterials] = useState<ErpMaterialRow[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [stockInType, setStockInType] = useState("PURCHASE");
  const [remark, setRemark] = useState("");
  const [items, setItems] = useState<FormItem[]>([{ materialId: "", quantity: "", unitPrice: "" }]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  // 历史列表
  const [rows, setRows] = useState<ErpStockInRow[] | null>(null);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [filterWarehouse, setFilterWarehouse] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterSearchInput, setFilterSearchInput] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterCreator, setFilterCreator] = useState("");
  const [filterStatus, setFilterStatus] = useState("CONFIRMED");
  const [creators, setCreators] = useState<CreatorOption[]>([]);
  const [printContent, setPrintContent] = useState<ErpPrintContent | null>(null);
  const [printing, setPrinting] = useState(false);

  // 详情 / 作废 / 撤关联
  const [detail, setDetail] = useState<ErpStockInRow | null>(null);
  const [voidTarget, setVoidTarget] = useState<ErpStockInRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<ErpStockInRow | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const materialMap = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);

  useEffect(() => {
    api<ErpWarehouseRow[]>("/api/erp/warehouses", { query: { onlyActive: "1" } })
      .then((data) => setWarehouses(Array.isArray(data) ? data : []))
      .catch(() => setWarehouses([]));
    api<ErpMaterialRow[]>("/api/erp/materials")
      .then((data) => setMaterials(Array.isArray(data) ? data : []))
      .catch(() => setMaterials([]));
    api<CreatorOption[]>("/api/erp/document-creators")
      .then((data) => setCreators(Array.isArray(data) ? data : []))
      .catch(() => setCreators([]));
  }, []);

  // 采购入库联动：?purchaseOrderId=xx 预填剩余到货明细
  useEffect(() => {
    if (!purchaseOrderIdFromLink) {
      setPurchaseSource(null);
      return;
    }
    setFormError("");
    api<ErpPurchaseOrderForStockIn>(`/api/erp/purchase-orders/${purchaseOrderIdFromLink}`)
      .then((order) => {
        if (order.status !== "ORDERED" && order.status !== "PARTIAL_RECEIVED") {
          setFormError("只有已下单或部分到货状态的采购订单可以生成入库单");
          return;
        }
        const available: FormItem[] = (order.items || [])
          .map((item) => {
            const remaining = Number(item.quantity) - Number(item.receivedQuantity || 0);
            return {
              materialId: item.materialId,
              purchaseOrderItemId: item.id,
              quantity: remaining > 0 ? String(remaining) : "",
              unitPrice: String(item.unitPrice || ""),
              maxQuantity: remaining,
            };
          })
          .filter((item) => (item.maxQuantity || 0) > 0);
        if (available.length === 0) {
          setFormError("该采购订单没有可入库的剩余明细");
          return;
        }
        setPurchaseSource({ id: order.id, orderNo: order.orderNo, status: order.status });
        setStockInType("PURCHASE");
        setRemark(`采购订单 ${order.orderNo} 入库`);
        setItems(available);
        setTab("form");
      })
      .catch((err) => setFormError((err as Error).message || "加载采购订单失败"));
  }, [purchaseOrderIdFromLink]);

  const buildHistoryQuery = useCallback(() => ({
    warehouseId: filterWarehouse || undefined,
    type: filterType || undefined,
    dateFrom: filterDateFrom || undefined,
    dateTo: filterDateTo || undefined,
    search: filterSearch.trim() || undefined,
    createdById: filterCreator || undefined,
    status: filterStatus || undefined,
  }), [filterWarehouse, filterType, filterDateFrom, filterDateTo, filterSearch, filterCreator, filterStatus]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const data = await api<{ items: ErpStockInRow[]; pagination?: typeof pagination }>("/api/erp/stock-in", {
        query: { ...buildHistoryQuery(), page: String(page), pageSize: "20" },
      });
      setRows(data.items || []);
      setPagination(data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 0 });
    } catch (err) {
      setListError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [buildHistoryQuery, page]);

  useEffect(() => {
    if (tab !== "history") return;
    void loadHistory();
  }, [tab, loadHistory, refreshKey]);

  useEffect(() => () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); }, []);

  const openDetail = async (id: string) => {
    try {
      const data = await api<ErpStockInRow>(`/api/erp/stock-in/${id}`);
      setDetail(data);
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  };

  const updateItem = (index: number, patch: Partial<FormItem>) => {
    setItems((current) => current.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  };

  const totalAmount = useMemo(() => sumLineAmounts(items), [items]);

  const submit = async () => {
    const validItems = items.filter((item) => item.materialId && item.quantity && item.unitPrice && (!purchaseSource || item.purchaseOrderItemId));
    if (!warehouseId || validItems.length === 0) return;
    if (purchaseSource && validItems.some((item) => Number(item.quantity) > Number(item.maxQuantity || 0))) {
      setFormError("入库数量不能超过采购订单明细的剩余到货数量");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const created = await api<{ id: string }>("/api/erp/stock-in", {
        method: "POST",
        body: {
          batchNo,
          warehouseId,
          type: stockInType,
          remark,
          purchaseOrderId: purchaseSource?.id || undefined,
          items: validItems,
        },
      });
      const failedFiles = pendingFiles.length ? await uploadErpAttachmentFiles("STOCK_IN", created.id, pendingFiles) : [];
      if (failedFiles.length) showToast(`入库单已创建，但附件上传失败：${failedFiles.join("、")}`, "error");
      else notify("入库成功，库存已更新");
      setBatchNo(""); setWarehouseId(""); setRemark("");
      setItems([{ materialId: "", quantity: "", unitPrice: "" }]);
      setPendingFiles([]);
      if (purchaseSource) {
        // 与平台一致：采购入库保存后回到采购订单详情（收货状态由入库自动派生）
        const source = purchaseSource;
        setPurchaseSource(null);
        navigate(`/erp/purchase-orders/${source.id}`);
        return;
      }
      setTab("history");
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const result = await collectPrintRows<ErpStockInRow>((printPage, printPageSize) =>
        api<{ items: ErpStockInRow[]; pagination?: { total?: number } }>("/api/erp/stock-in", {
          query: { ...buildHistoryQuery(), page: String(printPage), pageSize: String(printPageSize) },
        }),
      );
      setPrintContent({
        title: "入库记录",
        subtitle: `打印时间 ${new Date().toLocaleString("zh-CN")}${result.truncated ? "（结果超过 1000 条，仅打印前 1000 条）" : ""}`,
        headers: ["单号", "仓库", "类型", "状态", "来源采购单", "明细数", "日期"],
        rows: result.items.map((row) => [
          row.batchNo,
          row.warehouse?.name || "",
          row.type,
          row.status === "VOIDED" ? "已作废" : "已确认",
          row.purchaseOrder?.orderNo || "",
          row.items?.length || 0,
          date(row.createdAt),
        ]),
      });
      if (result.truncated) showToast("结果超过 1000 条，仅打印前 1000 条，请收窄筛选条件", "info");
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setPrinting(false);
    }
  };

  const resetForm = () => {
    setFormError("");
    setBatchNo(""); setWarehouseId(""); setRemark("");
    setItems([{ materialId: "", quantity: "", unitPrice: "" }]);
    setPendingFiles([]);
    setPurchaseSource(null);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <PageHeader title="入库单" sub="创建即确认并写入库存流水；纠错只能作废（追加反向冲减），不能编辑原单">
          <button className="btn-ghost" disabled={printing} onClick={() => void handlePrint()}>
            <Printer size={15} />
            {printing ? "准备打印…" : "打印当前筛选结果"}
          </button>
          {canEdit && (
            <button className="btn-brand" onClick={() => { resetForm(); setTab("form"); }}>
              新增入库
            </button>
          )}
        </PageHeader>
        {formError && <p className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">{formError}</p>}
        <div className="mt-3">
          <Segmented
            options={[{ value: "history" as const, label: "入库记录" }, { value: "form" as const, label: "新增入库" }]}
            value={tab}
            onChange={(next) => { if (next === "form" && !canEdit) return; setTab(next); }}
          />
        </div>
      </div>

      {tab === "form" && canEdit && (
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="panel space-y-4 p-5">
            {purchaseSource && (
              <p className="rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-xs">
                来源采购订单：<span className="font-medium">{purchaseSource.orderNo}</span>。物料明细已锁定，可按实际到货数量调整（不超过剩余量）。
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="block">
                <span className="label">入库单号</span>
                <input className="input mt-1" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="留空自动生成" />
              </label>
              <label className="block">
                <span className="label">仓库 *</span>
                <SearchSelect
                  className="mt-1"
                  value={warehouseId}
                  onChange={setWarehouseId}
                  options={[{ value: "", label: "请选择仓库" }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
                  placeholder="请选择仓库"
                />
              </label>
              <label className="block">
                <span className="label">入库类型</span>
                <select className="input mt-1" value={stockInType} disabled={Boolean(purchaseSource)} onChange={(e) => setStockInType(e.target.value)}>
                  {Object.entries(ERP_STOCK_IN_TYPE).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label">备注</span>
                <input className="input mt-1" value={remark} onChange={(e) => setRemark(e.target.value)} />
              </label>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">入库明细</h3>
                {!purchaseSource && (
                  <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setItems((current) => [...current, { materialId: "", quantity: "", unitPrice: "" }])}>＋ 添加行</button>
                )}
              </div>
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    {purchaseSource ? (
                      <div className="min-w-[220px] flex-1 rounded-lg border border-line bg-panel2/60 px-3 py-2 text-sm text-dim">
                        {(() => {
                          const material = materialMap.get(item.materialId);
                          return material ? `${material.code} - ${material.name}` : "采购物料";
                        })()}
                      </div>
                    ) : (
                      <SearchSelect
                        className="min-w-[220px] flex-1"
                        value={item.materialId}
                        onChange={(value) => updateItem(index, { materialId: value })}
                        options={[{ value: "", label: "请选择物料" }, ...materials.map((material) => ({ value: material.id, label: `${material.code} · ${material.name}`, sub: material.spec || undefined }))]}
                        placeholder="请选择物料"
                      />
                    )}
                    <div className="w-28">
                      <input
                        className="input"
                        type="number"
                        min="0.01"
                        max={purchaseSource ? item.maxQuantity : undefined}
                        step="0.01"
                        placeholder="数量"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, { quantity: e.target.value })}
                      />
                      {purchaseSource && <p className="mt-0.5 text-xs text-faint">最多 {Number(item.maxQuantity || 0).toLocaleString()}</p>}
                    </div>
                    <input className="input !w-28" type="number" placeholder="单价" value={item.unitPrice} onChange={(e) => updateItem(index, { unitPrice: e.target.value })} />
                    <span className="w-24 text-right text-sm text-faint">{money(Number(item.quantity || 0) * Number(item.unitPrice || 0))}</span>
                    {!purchaseSource && items.length > 1 && (
                      <button className="text-faint hover:text-bad" title="移除该行" onClick={() => setItems((current) => current.filter((_, idx) => idx !== index))}><Trash2 size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-right text-sm font-semibold">合计金额：{money(totalAmount)}</p>
            </div>

            <PendingErpAttachments files={pendingFiles} onChange={setPendingFiles} />

            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => { resetForm(); setTab("history"); }}>取消</button>
              <button
                className="btn-brand"
                disabled={saving || !warehouseId || items.filter((item) => item.materialId && item.quantity && item.unitPrice && (!purchaseSource || item.purchaseOrderItemId)).length === 0}
                onClick={() => void submit()}
              >
                {saving ? <Spinner className="!h-4 !w-4" /> : "确认入库"}
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
              <select className="input !w-auto" value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }}>
                <option value="">全部类型</option>
                {Object.entries(ERP_STOCK_IN_TYPE).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
              </select>
              <input className="input !w-36" type="date" aria-label="开始日期" value={filterDateFrom} onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }} />
              <input className="input !w-36" type="date" aria-label="结束日期" value={filterDateTo} onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }} />
              <div className="relative min-w-[200px] flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                <input
                  className="input !pl-9"
                  placeholder="物料名称、编码或入库单号"
                  defaultValue={filterSearchInput}
                  onChange={(e) => {
                    setFilterSearchInput(e.target.value);
                    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                    searchDebounceRef.current = setTimeout(() => { setFilterSearch(e.target.value); setPage(1); }, 400);
                  }}
                />
              </div>
              <select className="input !w-auto" value={filterCreator} onChange={(e) => { setFilterCreator(e.target.value); setPage(1); }}>
                <option value="">全部创建人</option>
                {creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name || "未命名用户"}</option>)}
              </select>
              <select className="input !w-auto" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}>
                <option value="">全部状态</option>
                <option value="CONFIRMED">已确认</option>
                <option value="VOIDED">已作废</option>
              </select>
              <button
                className="btn-ghost text-xs"
                onClick={() => { setFilterWarehouse(""); setFilterType(""); setFilterDateFrom(""); setFilterDateTo(""); setFilterSearchInput(""); setFilterSearch(""); setFilterCreator(""); setFilterStatus(""); setPage(1); }}
              >
                清空
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-4">
            <div className="panel overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: "1020px" }}>
                <thead className="sticky top-0 bg-panel z-10">
                  <tr>
                    <th className="th">单号</th>
                    <th className="th">仓库</th>
                    <th className="th">类型</th>
                    <th className="th">状态</th>
                    <th className="th">来源采购单</th>
                    <th className="th !text-right">明细数</th>
                    <th className="th">日期</th>
                    <th className="th !text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows?.map((row, index) => (
                    <tr key={row.id} className={`row-hover fade-up ${row.status === "VOIDED" ? "!bg-bad/8" : ""}`} style={{ animationDelay: `${Math.min(index * 20, 300)}ms` }}>
                      <td className="td mono text-xs">{row.batchNo}</td>
                      <td className="td text-dim">{row.warehouse?.name}</td>
                      <td className="td"><Pill tone={ERP_STOCK_IN_TYPE[row.type]?.tone || "text-dim bg-steel/25"}>{ERP_STOCK_IN_TYPE[row.type]?.label || row.type}</Pill></td>
                      <td className="td">
                        <Pill tone={ERP_STOCK_IN_STATUS[row.status]?.tone || "text-dim bg-steel/25"}>{ERP_STOCK_IN_STATUS[row.status]?.label || row.status}</Pill>
                        {row.status === "VOIDED" && (
                          <div className="mt-1 max-w-56 text-xs text-bad">
                            <div>时间：{row.voidedAt ? dateTime(row.voidedAt) : "—"}</div>
                            <div>作废人：{row.voidedBy?.name || "—"}</div>
                            {row.voidReason && <div>原因：{row.voidReason}</div>}
                          </div>
                        )}
                      </td>
                      <td className="td mono text-xs text-dim">{row.purchaseOrder?.orderNo || "—"}</td>
                      <td className="td text-right">{row.items?.length || 0} 项</td>
                      <td className="td text-xs text-dim">{date(row.createdAt)}</td>
                      <td className="td">
                        <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                          <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => void openDetail(row.id)}>查看</button>
                          {canEdit && row.status === "CONFIRMED" && (
                            <button className="btn-ghost !px-2 !py-1 text-xs !text-warn" onClick={() => { setVoidTarget(row); setVoidReason(""); }}>
                              <AlertTriangle size={12} />纠错/作废
                            </button>
                          )}
                          {canEdit && row.purchaseOrderId && (
                            <button className="btn-ghost !px-2 !py-1 text-xs !text-bad" onClick={() => setUnlinkTarget(row)}>
                              <Link2Off size={12} />撤销采购关联
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {loading && !rows && <div className="py-16 flex justify-center"><Spinner /></div>}
              {!loading && listError && <ErrorTip message={listError} onRetry={loadHistory} />}
              {!loading && !listError && rows && rows.length === 0 && <Empty text="暂无入库记录" />}
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

      {/* 详情 */}
      {detail && (
        <Sheet title={`入库单详情 - ${detail.batchNo}`} subtitle={detail.status === "VOIDED" ? "该单已作废，原始入库与库存流水均保留" : undefined} size="wide" onClose={() => setDetail(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
              <Field label="仓库">{detail.warehouse?.name || <Dash />}</Field>
              <Field label="类型">{ERP_STOCK_IN_TYPE[detail.type]?.label || detail.type}</Field>
              <Field label="状态">{ERP_STOCK_IN_STATUS[detail.status]?.label || detail.status}</Field>
              <Field label="日期">{date(detail.createdAt)}</Field>
              <Field label="来源采购单">{detail.purchaseOrder?.orderNo || detail.purchaseOrderId || <Dash />}</Field>
              <Field label="备注">{detail.remark || <Dash />}</Field>
            </div>

            {detail.status === "VOIDED" && (
              <div className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2.5 text-xs text-bad">
                <p className="font-medium">该入库单已作废，原始入库与库存流水均保留。</p>
                <p className="mt-1">作废时间：{detail.voidedAt ? dateTime(detail.voidedAt) : "—"} · 作废人：{detail.voidedBy?.name || "—"}</p>
                <p>作废原因：{detail.voidReason || "—"}</p>
              </div>
            )}

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="th">物料</th>
                  <th className="th !text-right">数量</th>
                  <th className="th !text-right">单价</th>
                  <th className="th !text-right">金额</th>
                </tr>
              </thead>
              <tbody>
                {detail.items?.map((item) => (
                  <tr key={item.id} className="row-hover">
                    <td className="td">
                      <div className="font-medium">{item.materialNameSnapshot || item.material?.name || "—"}</div>
                      <div className="text-xs text-faint">
                        {item.materialCodeSnapshot || item.material?.code || "—"} {item.materialSpecSnapshot || item.material?.spec || ""}
                      </div>
                    </td>
                    <td className="td text-right">
                      {Number(item.quantity).toLocaleString()} {item.unitSnapshot || item.material?.unit || ""}
                      <div className="text-xs text-faint">库存 {Number(item.beforeQty ?? 0).toLocaleString()} → {Number(item.afterQty ?? 0).toLocaleString()}</div>
                    </td>
                    <td className="td text-right mono">{item.unitPrice != null ? money(item.unitPrice) : "—"}</td>
                    <td className="td text-right font-medium mono">{item.amount != null ? money(item.amount) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {(detail.voidRecord?.items?.length ?? 0) > 0 && (
              <section className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2.5 text-sm">
                <h3 className="text-sm font-medium text-bad">作废反向冲减明细</h3>
                {detail.voidRecord?.items?.map((item) => (
                  <p key={item.id} className="mt-1 text-dim">
                    {item.material?.code || item.materialId} {item.material?.name || ""}：冲减 {Number(item.quantity).toLocaleString()}，库存 {Number(item.beforeQty).toLocaleString()} → {Number(item.afterQty).toLocaleString()}，冲减金额 {money(item.reversalAmount)}
                  </p>
                ))}
              </section>
            )}

            {(detail.stockMovements?.length ?? 0) > 0 && (
              <section className="rounded-lg border border-line px-3 py-2.5 text-sm">
                <h3 className="text-sm font-medium">库存流水</h3>
                {detail.stockMovements?.map((movement) => (
                  <p key={movement.id} className="mt-1 text-dim">
                    {movement.createdAt ? dateTime(movement.createdAt) : ""} · {movement.type === "STOCK_OUT" ? "作废冲减" : ERP_MOVEMENT_TYPE[movement.type] || movement.type} · {movement.material?.code || ""} · {Number(movement.beforeQty ?? 0).toLocaleString()} → {Number(movement.afterQty ?? 0).toLocaleString()}
                  </p>
                ))}
              </section>
            )}

            {(detail.operationLogs?.length ?? 0) > 0 && (
              <section className="rounded-lg border border-line px-3 py-2.5 text-sm">
                <h3 className="text-sm font-medium">操作日志</h3>
                {detail.operationLogs?.map((log) => (
                  <p key={log.id} className="mt-1 text-dim">
                    {log.createdAt ? dateTime(log.createdAt) : ""} · {log.action === "VOID_STOCK_IN" ? "作废入库单" : log.action === "CREATE_STOCK_IN" ? "创建入库单" : log.action}
                  </p>
                ))}
              </section>
            )}

            <ErpDocumentAttachments entityType="STOCK_IN" entityId={detail.id} />
          </div>
        </Sheet>
      )}

      {/* 纠错/作废 */}
      {voidTarget && (
        <ConfirmDialog
          title="入库单纠错/作废"
          message={`单号 ${voidTarget.batchNo} 已提交并影响库存，不能直接编辑明细或删除。`}
          confirmText="确认作废"
          cancelText="关闭"
          danger
          busy={voiding}
          onCancel={() => { setVoidTarget(null); setVoidReason(""); }}
          onConfirm={() => void (async () => {
            if (!isValidVoidReason(voidReason)) return;
            setVoiding(true);
            try {
              const result = await api<{ id?: string }>(`/api/erp/stock-in/${voidTarget.id}/void`, { method: "POST", body: { reason: voidReason.trim() } });
              notify("入库单已作废，库存已反向冲减");
              setVoidTarget(null);
              setVoidReason("");
              setRefreshKey((value) => value + 1);
              if (result.id && detail?.id === result.id) await openDetail(result.id);
            } catch (err) {
              setFormError((err as Error).message);
              showToast((err as Error).message, "error");
            } finally {
              setVoiding(false);
            }
          })()}
        >
          {voidTarget.purchaseOrderId ? (
            <div className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
              <p>该单来自采购入库，不能直接作废。</p>
              <p className="mt-1">请先使用「撤销采购关联」纠正采购收货，再按库存纠正流程处理。</p>
            </div>
          ) : voidTarget.productionOrderId ? (
            <div className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
              <p>该单为生产退料，不能直接作废。</p>
              <p className="mt-1">请通过生产工单变更审批纠正退料，避免已退料汇总与工单版本脱节。</p>
            </div>
          ) : voidTarget.status !== "CONFIRMED" ? (
            <div className="rounded-lg border border-line bg-panel2/60 px-3 py-2 text-xs text-dim">该入库单不是可作废的已确认状态。</div>
          ) : (
            <div className="space-y-2">
              <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">作废会追加反向库存流水，原入库单、明细和历史流水均不会删除或改写。</p>
              <label className="block text-left">
                <span className="label">作废原因（5–500 字）</span>
                <textarea className="input mt-1" rows={4} maxLength={500} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="请说明作废原因" />
              </label>
            </div>
          )}
        </ConfirmDialog>
      )}

      {/* 撤销采购关联 */}
      {unlinkTarget && (
        <ConfirmDialog
          title="撤销采购关联"
          message={`确认撤销入库单 ${unlinkTarget.batchNo} 与采购订单的关联吗？库存不会回退，平台会重算采购单的收货状态。`}
          confirmText="撤销关联"
          danger
          busy={unlinking}
          onCancel={() => setUnlinkTarget(null)}
          onConfirm={() => void (async () => {
            setUnlinking(true);
            try {
              await api(`/api/erp/stock-in/${unlinkTarget.id}/unlink-purchase`, { method: "POST" });
              notify("已撤销采购关联（库存不回退）");
              setUnlinkTarget(null);
              setRefreshKey((value) => value + 1);
              if (detail?.id === unlinkTarget.id) setDetail(null);
            } catch (err) {
              setFormError((err as Error).message);
              showToast((err as Error).message, "error");
            } finally {
              setUnlinking(false);
            }
          })()}
        />
      )}

      <ErpPrintArea content={printContent} onDone={() => setPrintContent(null)} />
    </div>
  );
}
