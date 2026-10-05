import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Eraser, Printer, RefreshCw, Search } from "lucide-react";
import { api, getCachedUser } from "../../lib/api";
import { Pill, Spinner, Empty, ErrorTip, PageHeader, Sheet, SearchSelect, showToast, ConfirmDialog } from "../../components/ui";
import { flattenCategories, isInventoryBelowWarningThreshold, collectPrintRows, resolveInventoryWarningThreshold } from "../../lib/erp";
import { money } from "../../lib/format";
import { ErpPrintArea, type ErpPrintContent } from "./print-sheet";
import type { ErpInventoryRow, ErpMaterialCategoryRow, ErpWarehouseRow } from "../../types";

/** 库存台账：只读总览 + 缺货预警弹窗 + 打印当前筛选结果 + 零库存行清除（对齐平台 /erp/inventory） */
export default function InventoryPage({ initialFilters }: { initialFilters?: Record<string, string | undefined> }) {
  const canClearZeroRows = getCachedUser()?.role === "SUPER_ADMIN" || getCachedUser()?.role === "WAREHOUSE";
  const [rows, setRows] = useState<ErpInventoryRow[] | null>(null);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState(initialFilters?.search || "");
  const [warehouseId, setWarehouseId] = useState(initialFilters?.warehouseId || "");
  const [categoryId, setCategoryId] = useState("");
  const [alertOnly, setAlertOnly] = useState(initialFilters?.alertOnly === "1");
  const [zeroStock, setZeroStock] = useState(initialFilters?.zeroStock === "1");
  const [demandWithoutStock, setDemandWithoutStock] = useState(false);

  const [warehouses, setWarehouses] = useState<ErpWarehouseRow[]>([]);
  const [categories, setCategories] = useState<ErpMaterialCategoryRow[]>([]);

  const [shortageItems, setShortageItems] = useState<ErpInventoryRow[] | null>(null);
  const [showShortage, setShowShortage] = useState(false);
  const shortageAutoShownRef = useRef(false);

  const [printContent, setPrintContent] = useState<ErpPrintContent | null>(null);
  const [printing, setPrinting] = useState(false);
  const [clearTarget, setClearTarget] = useState<ErpInventoryRow | null>(null);
  const [clearing, setClearing] = useState(false);
  const [searchInput, setSearchInput] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadRequestRef = useRef(0);

  const flatCategories = useMemo(() => flattenCategories(categories), [categories]);

  const buildQuery = useCallback(() => ({
    search: search.trim() || undefined,
    warehouseId: warehouseId || undefined,
    categoryId: categoryId || undefined,
    alertOnly: alertOnly ? "1" : undefined,
    zeroStock: zeroStock ? "1" : undefined,
    demandWithoutStock: demandWithoutStock ? "1" : undefined,
  }), [search, warehouseId, categoryId, alertOnly, zeroStock, demandWithoutStock]);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const data = await api<{ items: ErpInventoryRow[]; pagination?: typeof pagination }>("/api/erp/inventory", {
        query: { ...buildQuery(), page: alertOnly ? undefined : String(page), pageSize: alertOnly ? undefined : "20" },
      });
      if (requestId !== loadRequestRef.current) return;
      setRows(data.items || []);
      setPagination(data.pagination || { page: 1, pageSize: 20, total: data.items?.length || 0, totalPages: 1 });
    } catch (err) {
      if (requestId === loadRequestRef.current) setError((err as Error).message);
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [buildQuery, page, alertOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => {
    loadRequestRef.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  useEffect(() => {
    api<ErpWarehouseRow[]>("/api/erp/warehouses", { query: { onlyActive: "1" } })
      .then((data) => setWarehouses(Array.isArray(data) ? data : []))
      .catch(() => setWarehouses([]));
    api<ErpMaterialCategoryRow[]>("/api/erp/material-categories")
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
  }, []);

  // 进页自动弹缺货预警：按当前仓库/分类拉一次预警清单（只弹一次）
  useEffect(() => {
    if (shortageAutoShownRef.current) return;
    shortageAutoShownRef.current = true;
    api<{ items: ErpInventoryRow[] }>("/api/erp/inventory", {
      query: { search: search.trim() || undefined, warehouseId: warehouseId || undefined, categoryId: categoryId || undefined, alertOnly: "1", pageSize: "100" },
    })
      .then((data) => {
        const items = data.items || [];
        if (items.length > 0) {
          setShortageItems(items);
          setShowShortage(true);
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearchInput = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(value); setPage(1); }, 400);
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const result = await collectPrintRows<ErpInventoryRow>((printPage, printPageSize) =>
        api<{ items: ErpInventoryRow[]; pagination?: { total?: number } }>("/api/erp/inventory", {
          query: { ...buildQuery(), page: String(printPage), pageSize: String(printPageSize) },
        }),
      );
      setPrintContent({
        title: "库存台账",
        subtitle: `打印时间 ${new Date().toLocaleString("zh-CN")}${result.truncated ? "（结果超过 1000 条，仅打印前 1000 条）" : ""}`,
        headers: ["物料编码", "物料名称", "规格", "仓库", "库存数量", "预警线", "库存金额", "状态"],
        rows: result.items.map((row) => {
          const threshold = row.material ? resolveInventoryWarningThreshold(row.material) : null;
          const qty = Number(row.quantity);
          return [
            row.material?.code || "",
            row.material?.name || "",
            row.material?.spec || "",
            row.warehouse?.name || "",
            `${Number(row.quantity).toLocaleString()} ${row.material?.unit || ""}`,
            threshold !== null ? threshold.toLocaleString() : "",
            money(row.totalAmount),
            qty <= 0 ? "零库存" : isInventoryBelowWarningThreshold(row.quantity, row.material || {}) ? "低于预警线" : "正常",
          ];
        }),
      });
      if (result.truncated) showToast("结果超过 1000 条，仅打印前 1000 条，请收窄筛选条件", "info");
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <PageHeader title="库存台账" sub={`共 ${pagination.total} 条库存记录 · 预警口径：物料安全库存优先，其次分类预警线`}>
          <button className="btn-ghost" disabled={printing} onClick={() => void handlePrint()}>
            <Printer size={15} />
            {printing ? "准备打印…" : "打印当前筛选结果"}
          </button>
          <button className="btn-ghost !px-2.5" title="刷新" onClick={load}>
            {loading ? <Spinner className="!w-4 !h-4" /> : <RefreshCw size={15} />}
          </button>
        </PageHeader>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input !pl-9" placeholder="搜索物料名称/编码…" defaultValue={searchInput} onChange={(e) => onSearchInput(e.target.value)} />
          </div>
          <SearchSelect
            className="!w-40"
            value={warehouseId}
            onChange={(value) => { setWarehouseId(value); setPage(1); }}
            options={[{ value: "", label: "全部仓库" }, ...warehouses.map((w) => ({ value: w.id, label: w.name, sub: w.code || undefined }))]}
            placeholder="全部仓库"
          />
          <SearchSelect
            className="!w-44"
            value={categoryId}
            onChange={(value) => { setCategoryId(value); setPage(1); }}
            options={[{ value: "", label: "全部分类" }, ...flatCategories.map((c) => ({ value: c.id, label: c.label }))]}
            placeholder="全部分类"
          />
          <FilterCheckbox checked={alertOnly} onChange={(v) => { setAlertOnly(v); setPage(1); }} icon={<AlertTriangle size={13} className="text-warn" />} label="仅显示预警" />
          <FilterCheckbox checked={zeroStock} onChange={(v) => { setZeroStock(v); setPage(1); }} label="零库存" />
          <FilterCheckbox checked={demandWithoutStock} onChange={(v) => { setDemandWithoutStock(v); setPage(1); }} label="有需求无库存" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: "980px" }}>
            <thead className="sticky top-0 bg-panel z-10">
              <tr>
                <th className="th">物料编码</th>
                <th className="th">物料名称</th>
                <th className="th">规格</th>
                <th className="th">仓库</th>
                <th className="th !text-right">库存数量</th>
                <th className="th !text-right">预警线</th>
                <th className="th !text-right">库存金额</th>
                <th className="th !text-center">状态</th>
                {canClearZeroRows && <th className="th !text-center">操作</th>}
              </tr>
            </thead>
            <tbody>
              {rows?.map((row, index) => {
                const threshold = row.material ? resolveInventoryWarningThreshold(row.material) : null;
                const qty = Number(row.quantity);
                const isZero = qty <= 0;
                const isAlert = !isZero && isInventoryBelowWarningThreshold(row.quantity, row.material || {});
                return (
                  <tr key={row.id} className={`row-hover fade-up ${isZero ? "!bg-bad/8" : isAlert ? "!bg-warn/8" : ""}`} style={{ animationDelay: `${Math.min(index * 20, 300)}ms` }}>
                    <td className="td mono text-xs">{row.material?.code}</td>
                    <td className="td font-medium">{row.material?.name}</td>
                    <td className="td text-dim">{row.material?.spec || "—"}</td>
                    <td className="td text-dim">{row.warehouse?.name}</td>
                    <td className="td text-right font-medium">{qty.toLocaleString()} {row.material?.unit}</td>
                    <td className="td text-right text-dim">{threshold !== null ? threshold.toLocaleString() : "—"}</td>
                    <td className="td text-right mono">{money(row.totalAmount)}</td>
                    <td className="td text-center">
                      {isZero ? (
                        <Pill tone="text-bad bg-bad/10">零库存</Pill>
                      ) : isAlert ? (
                        <Pill tone="text-warn bg-warn/10"><AlertTriangle size={11} className="mr-0.5 inline" />低于预警线</Pill>
                      ) : (
                        <Pill tone="text-ok bg-ok/10">正常</Pill>
                      )}
                    </td>
                    {canClearZeroRows && (
                      <td className="td text-center">
                        {isZero ? (
                          <button className="btn-ghost !px-1.5 !py-1 text-xs text-bad" title="清除该零库存结存行" onClick={() => setClearTarget(row)}>
                            <Eraser size={13} />
                          </button>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loading && !rows && <div className="py-16 flex justify-center"><Spinner /></div>}
          {!loading && error && <ErrorTip message={error} onRetry={load} />}
          {!loading && !error && rows && rows.length === 0 && <Empty text="暂无库存数据" />}
        </div>

        {!alertOnly && pagination.totalPages > 1 && (
          <div className="mt-3 flex items-center justify-center gap-3 text-xs text-faint">
            <button className="btn-ghost !py-1 text-xs" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</button>
            <span>第 {page} / {pagination.totalPages} 页（共 {pagination.total} 条）</span>
            <button className="btn-ghost !py-1 text-xs" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}>下一页</button>
          </div>
        )}
      </div>

      {showShortage && shortageItems && (
        <Sheet
          title="缺货预警"
          subtitle={`共 ${shortageItems.length} 项低于预警线`}
          size="wide"
          onClose={() => setShowShortage(false)}
        >
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="th">名称</th>
                <th className="th">规格</th>
                <th className="th !text-right">标准价</th>
                <th className="th">供货商</th>
                <th className="th !text-right">剩余库存</th>
                <th className="th">仓库</th>
                <th className="th !text-right">预警线</th>
              </tr>
            </thead>
            <tbody>
              {shortageItems.map((row) => {
                const threshold = row.material ? resolveInventoryWarningThreshold(row.material) : null;
                return (
                  <tr key={row.id} className="row-hover">
                    <td className="td font-medium">{row.material?.name}</td>
                    <td className="td text-dim">{row.material?.spec || "—"}</td>
                    <td className="td text-right mono">{row.material?.standardPrice ? money(row.material.standardPrice) : "—"}</td>
                    <td className="td text-dim">{row.material?.supplier || "—"}</td>
                    <td className="td text-right font-medium text-bad">{Number(row.quantity).toLocaleString()} {row.material?.unit}</td>
                    <td className="td text-dim">{row.warehouse?.name}</td>
                    <td className="td text-right text-dim">{threshold !== null ? threshold.toLocaleString() : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Sheet>
      )}

      {clearTarget && (
        <ConfirmDialog
          title="清除零库存行"
          message={`确定清除「${clearTarget.material?.code || ""} ${clearTarget.material?.name || ""}」（${clearTarget.warehouse?.name || ""}）的零库存结存行？只删除这条结存行，出入库历史单据不受影响。`}
          confirmText="清除"
          danger
          busy={clearing}
          onCancel={() => setClearTarget(null)}
          onConfirm={async () => {
            setClearing(true);
            try {
              await api(`/api/erp/inventory/${clearTarget.id}`, { method: "DELETE" });
              showToast("零库存行已清除");
              setRows((prev) => prev?.filter((item) => item.id !== clearTarget.id) ?? null);
              setPagination((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
              setClearTarget(null);
            } catch (err) {
              showToast((err as Error).message, "error");
            } finally {
              setClearing(false);
            }
          }}
        />
      )}

      <ErpPrintArea content={printContent} onDone={() => setPrintContent(null)} />
    </div>
  );
}

function FilterCheckbox({ checked, onChange, label, icon }: { checked: boolean; onChange: (v: boolean) => void; label: string; icon?: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-dim">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {icon}
      {label}
    </label>
  );
}
