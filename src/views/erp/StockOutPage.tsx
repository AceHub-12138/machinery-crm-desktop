import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Printer, RefreshCw, Search, Trash2 } from "lucide-react";
import { api, getCachedUser } from "../../lib/api";
import { Pill, Spinner, Empty, ErrorTip, PageHeader, Sheet, Segmented, SearchSelect, notify, showToast, Field, Dash } from "../../components/ui";
import { ERP_STOCK_OUT_TYPE, collectPrintRows } from "../../lib/erp";
import { date, dateTime } from "../../lib/format";
import { ErpPrintArea, type ErpPrintContent } from "./print-sheet";
import { ErpDocumentAttachments, PendingErpAttachments, uploadErpAttachmentFiles } from "../../components/erp-attachments";
import type { ErpInventoryRow, ErpMaterialRow, ErpStockOutRow, ErpWarehouseRow } from "../../types";

interface CreatorOption { id: string; name?: string | null }

interface FormItem { materialId: string; quantity: string }

/** 出库单：生产领用/盘亏/其他；前端按所选仓库校验可用量（平台服务端仍有最终校验） */
export default function StockOutPage() {
  const canEdit = getCachedUser()?.role === "SUPER_ADMIN" || getCachedUser()?.role === "WAREHOUSE";
  const [tab, setTab] = useState<"history" | "form">("history");

  // 新增表单
  const [warehouses, setWarehouses] = useState<ErpWarehouseRow[]>([]);
  const [materials, setMaterials] = useState<ErpMaterialRow[]>([]);
  const [inventories, setInventories] = useState<ErpInventoryRow[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [stockOutType, setStockOutType] = useState("PRODUCTION");
  const [remark, setRemark] = useState("");
  const [items, setItems] = useState<FormItem[]>([{ materialId: "", quantity: "" }]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // 历史
  const [rows, setRows] = useState<ErpStockOutRow[] | null>(null);
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
  const [creators, setCreators] = useState<CreatorOption[]>([]);
  const [printContent, setPrintContent] = useState<ErpPrintContent | null>(null);
  const [printing, setPrinting] = useState(false);
  const [detail, setDetail] = useState<ErpStockOutRow | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  // 选中仓库后拉取台账做前端可用量提示
  useEffect(() => {
    if (!warehouseId) {
      setInventories([]);
      return;
    }
    api<{ items: ErpInventoryRow[] }>("/api/erp/inventory", { query: { warehouseId, pageSize: "100" } })
      .then((data) => setInventories(data.items || []))
      .catch(() => setInventories([]));
  }, [warehouseId]);

  const buildHistoryQuery = useCallback(() => ({
    warehouseId: filterWarehouse || undefined,
    type: filterType || undefined,
    dateFrom: filterDateFrom || undefined,
    dateTo: filterDateTo || undefined,
    search: filterSearch.trim() || undefined,
    createdById: filterCreator || undefined,
  }), [filterWarehouse, filterType, filterDateFrom, filterDateTo, filterSearch, filterCreator]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const data = await api<{ items: ErpStockOutRow[]; pagination?: typeof pagination }>("/api/erp/stock-out", {
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
  }, [tab, loadHistory]);

  useEffect(() => () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); }, []);

  const availableQty = useCallback(
    (materialId: string) => Number(inventories.find((row) => row.materialId === materialId)?.quantity || 0),
    [inventories],
  );

  const submit = async () => {
    const validItems = items.filter((item) => item.materialId && item.quantity);
    if (!warehouseId || validItems.length === 0) return;
    for (const item of validItems) {
      if (Number(item.quantity) > availableQty(item.materialId)) {
        const material = materials.find((row) => row.id === item.materialId);
        setFormError(`物料【${material?.name || item.materialId}】库存不足：需要 ${item.quantity}，可用 ${availableQty(item.materialId)}`);
        return;
      }
    }
    setFormError("");
    setSaving(true);
    try {
      const created = await api<{ id: string }>("/api/erp/stock-out", {
        method: "POST",
        body: { batchNo, warehouseId, type: stockOutType, remark, items: validItems },
      });
      const failedFiles = pendingFiles.length ? await uploadErpAttachmentFiles("STOCK_OUT", created.id, pendingFiles) : [];
      if (failedFiles.length) showToast(`出库单已创建，但附件上传失败：${failedFiles.join("、")}`, "error");
      else notify("出库成功，库存已扣减");
      setBatchNo(""); setWarehouseId(""); setRemark("");
      setItems([{ materialId: "", quantity: "" }]);
      setPendingFiles([]);
      setTab("history");
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const result = await collectPrintRows<ErpStockOutRow>((printPage, printPageSize) =>
        api<{ items: ErpStockOutRow[]; pagination?: { total?: number } }>("/api/erp/stock-out", {
          query: { ...buildHistoryQuery(), page: String(printPage), pageSize: String(printPageSize) },
        }),
      );
      setPrintContent({
        title: "出库记录",
        subtitle: `打印时间 ${new Date().toLocaleString("zh-CN")}${result.truncated ? "（结果超过 1000 条，仅打印前 1000 条）" : ""}`,
        headers: ["单号", "仓库", "类型", "明细数", "日期"],
        rows: result.items.map((row) => [
          row.batchNo,
          row.warehouse?.name || "",
          ERP_STOCK_OUT_TYPE[row.type]?.label || row.type,
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

  const openDetail = async (id: string) => {
    try {
      setDetail(await api<ErpStockOutRow>(`/api/erp/stock-out/${id}`));
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <PageHeader title="出库单" sub="确认即扣减库存并写入流水；工单领料的超领确认在生产工单页进行">
          <button className="btn-ghost" disabled={printing} onClick={() => void handlePrint()}>
            <Printer size={15} />
            {printing ? "准备打印…" : "打印当前筛选结果"}
          </button>
          {canEdit && (
            <button className="btn-brand" onClick={() => setTab("form")}>
              新增出库
            </button>
          )}
        </PageHeader>
        {tab === "form" && formError && <p className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">{formError}</p>}
        <div className="mt-3">
          <Segmented
            options={[{ value: "history" as const, label: "出库记录" }, { value: "form" as const, label: "新增出库" }]}
            value={tab}
            onChange={(next) => { if (next === "form" && !canEdit) return; setTab(next); }}
          />
        </div>
      </div>

      {tab === "form" && canEdit && (
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="panel space-y-4 p-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="block">
                <span className="label">出库单号（选填）</span>
                <input className="input mt-1" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="留空自动生成" />
              </label>
              <label className="block">
                <span className="label">仓库 *</span>
                <SearchSelect
                  className="mt-1"
                  value={warehouseId}
                  onChange={(value) => { setWarehouseId(value); setItems([{ materialId: "", quantity: "" }]); }}
                  options={[{ value: "", label: "请选择仓库" }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
                  placeholder="请选择仓库"
                />
              </label>
              <label className="block">
                <span className="label">出库类型</span>
                <select className="input mt-1" value={stockOutType} onChange={(e) => setStockOutType(e.target.value)}>
                  {Object.entries(ERP_STOCK_OUT_TYPE).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="label">备注</span>
                <input className="input mt-1" value={remark} onChange={(e) => setRemark(e.target.value)} />
              </label>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">出库明细</h3>
                <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setItems((current) => [...current, { materialId: "", quantity: "" }])}>＋ 添加行</button>
              </div>
              <div className="space-y-2">
                {items.map((item, index) => {
                  const over = item.materialId && Number(item.quantity || 0) > availableQty(item.materialId);
                  return (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                      <SearchSelect
                        className="min-w-[220px] flex-1"
                        value={item.materialId}
                        onChange={(value) => setItems((current) => current.map((row, idx) => (idx === index ? { ...row, materialId: value } : row)))}
                        options={[{ value: "", label: "请选择物料" }, ...materials.map((material) => ({ value: material.id, label: `${material.code} · ${material.name}`, sub: material.spec || undefined }))]}
                        placeholder="请选择物料"
                      />
                      <input
                        className="input !w-28"
                        type="number"
                        min="0.01"
                        placeholder="数量"
                        value={item.quantity}
                        onChange={(e) => setItems((current) => current.map((row, idx) => (idx === index ? { ...row, quantity: e.target.value } : row)))}
                      />
                      <span className={`w-28 text-xs ${over ? "font-medium text-bad" : "text-faint"}`}>
                        {over ? "超库存!" : item.materialId ? `可用 ${availableQty(item.materialId)}` : ""}
                      </span>
                      {items.length > 1 && (
                        <button className="text-faint hover:text-bad" title="移除该行" onClick={() => setItems((current) => current.filter((_, idx) => idx !== index))}><Trash2 size={14} /></button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <PendingErpAttachments files={pendingFiles} onChange={setPendingFiles} />

            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => { setPendingFiles([]); setFormError(""); setTab("history"); }}>取消</button>
              <button
                className="btn-brand"
                disabled={saving || !warehouseId || items.filter((item) => item.materialId && item.quantity).length === 0}
                onClick={() => void submit()}
              >
                {saving ? <Spinner className="!h-4 !w-4" /> : "确认出库"}
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
                {Object.entries(ERP_STOCK_OUT_TYPE).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
              </select>
              <input className="input !w-36" type="date" aria-label="开始日期" value={filterDateFrom} onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }} />
              <input className="input !w-36" type="date" aria-label="结束日期" value={filterDateTo} onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }} />
              <div className="relative min-w-[200px] flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                <input
                  className="input !pl-9"
                  placeholder="物料名称、编码或出库单号"
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
              <button
                className="btn-ghost text-xs"
                onClick={() => { setFilterWarehouse(""); setFilterType(""); setFilterDateFrom(""); setFilterDateTo(""); setFilterSearchInput(""); setFilterSearch(""); setFilterCreator(""); setPage(1); }}
              >
                清空
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-4">
            <div className="panel overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: "860px" }}>
                <thead className="sticky top-0 bg-panel z-10">
                  <tr>
                    <th className="th">单号</th>
                    <th className="th">仓库</th>
                    <th className="th">类型</th>
                    <th className="th !text-right">明细数</th>
                    <th className="th">日期</th>
                    <th className="th !text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows?.map((row, index) => (
                    <tr key={row.id} className="row-hover fade-up" style={{ animationDelay: `${Math.min(index * 20, 300)}ms` }}>
                      <td className="td mono text-xs">{row.batchNo}</td>
                      <td className="td text-dim">{row.warehouse?.name}</td>
                      <td className="td"><Pill tone={ERP_STOCK_OUT_TYPE[row.type]?.tone || "text-dim bg-steel/25"}>{ERP_STOCK_OUT_TYPE[row.type]?.label || row.type}</Pill></td>
                      <td className="td text-right">{row.items?.length || 0} 项</td>
                      <td className="td text-xs text-dim">{date(row.createdAt)}</td>
                      <td className="td text-center">
                        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => void openDetail(row.id)}>查看</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {loading && !rows && <div className="py-16 flex justify-center"><Spinner /></div>}
              {!loading && listError && <ErrorTip message={listError} onRetry={loadHistory} />}
              {!loading && !listError && rows && rows.length === 0 && <Empty text="暂无出库记录" />}
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

      {detail && (
        <Sheet title={`出库单详情 - ${detail.batchNo}`} size="wide" onClose={() => setDetail(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
              <Field label="仓库">{detail.warehouse?.name || <Dash />}</Field>
              <Field label="类型">{ERP_STOCK_OUT_TYPE[detail.type]?.label || detail.type}</Field>
              <Field label="日期">{date(detail.createdAt)}</Field>
              <Field label="备注">{detail.remark || <Dash />}</Field>
              <Field label="创建人">{detail.createdBy?.name || <Dash />}</Field>
              <Field label="创建时间">{dateTime(detail.createdAt)}</Field>
            </div>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="th">物料</th>
                  <th className="th !text-right">数量</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
            <ErpDocumentAttachments entityType="STOCK_OUT" entityId={detail.id} />
          </div>
        </Sheet>
      )}

      <ErpPrintArea content={printContent} onDone={() => setPrintContent(null)} />
    </div>
  );
}
