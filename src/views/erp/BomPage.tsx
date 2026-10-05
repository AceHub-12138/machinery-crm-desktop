import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, ChevronDown, ChevronRight, Eye, Pencil, Plus, RefreshCw, Search, Trash2,
} from "lucide-react";
import { api, getCachedUser } from "../../lib/api";
import { Pill, Spinner, Empty, ErrorTip, PageHeader, Sheet, ConfirmDialog, SearchSelect, notify, showToast } from "../../components/ui";
import { bomUnitStep, collectDescendantKeys, flattenCategories, isPackageMaterial, orderTreeItems, treeDepthOf, treeVisible, type FlatCategory } from "../../lib/erp";
import type { ErpBomItemRow, ErpBomRow, ErpMaterialCategoryRow, ErpMaterialRow } from "../../types";

interface ErpMainProduct {
  id: string;
  model?: string | null;
  category?: string | null;
  translations?: { language: string; name: string }[] | null;
}

/** 列表行里内嵌的产品可能只带部分字段 */
type ProductLike = { model?: string | null; category?: string | null; translations?: { language: string; name: string }[] | null } | null | undefined;

interface BomLine {
  clientKey: string;
  parentClientKey: string;
  materialId: string;
  quantity: string;
}

function makeLine(materialId = "", parentClientKey = ""): BomLine {
  return { clientKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`, parentClientKey, materialId, quantity: "1" };
}

function productLabel(product: ProductLike) {
  if (!product) return "未关联产品";
  const name = product.translations?.[0]?.name;
  return name ? `${product.model} - ${name}` : product.model || product.category || "未命名产品";
}

function displayBomError(message: unknown) {
  return String(message || "整机用料清单保存失败").replaceAll("BOM", "整机用料清单");
}

function quantityText(value: unknown) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

/** 整机用料清单（BOM）：左列表右明细 + 树形编辑（零件包分组/批量选料/版本管理），对齐平台 /erp/bom */
export default function BomPage() {
  const [rows, setRows] = useState<ErpBomRow[] | null>(null);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("1");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ErpBomRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [form, setForm] = useState<null | { editId: string | null }>(null);
  const [disableTarget, setDisableTarget] = useState<ErpBomRow | null>(null);
  const [disabling, setDisabling] = useState(false);

  const [products, setProducts] = useState<ErpMainProduct[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const canEdit = getCachedUser()?.role === "SUPER_ADMIN" || getCachedUser()?.role === "WAREHOUSE";

  const loadBoms = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ items: ErpBomRow[]; pagination?: typeof pagination }>("/api/erp/boms", {
        query: { search: search.trim() || undefined, active: active || undefined, page: String(page), pageSize: "20" },
      });
      setRows(data.items || []);
      setPagination(data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 0 });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, active, page]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadBoms(); }, 250);
    return () => clearTimeout(timer);
  }, [loadBoms]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const data = await api<ErpBomRow>(`/api/erp/boms/${id}`);
      setDetail(data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // 列表加载后默认选中第一行
  useEffect(() => {
    if (!selectedId && rows?.[0]?.id) void loadDetail(rows[0].id);
  }, [rows, selectedId, loadDetail]);

  useEffect(() => {
    api<ErpMainProduct[]>("/api/erp/products", { query: { productType: "MAIN", pageSize: "50" } })
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]));
  }, []);

  const orderedDetailItems = useMemo(
    () => orderTreeItems<ErpBomItemRow>(detail?.items || [], (item) => item.id || "", (item) => item.parentItemId || ""),
    [detail],
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <PageHeader title="整机用料清单" sub="维护每台机床生产所需的标准物料，原行业术语为 BOM；零件包为分组，子物料用量随零件包与生产台数相乘">
          {canEdit && (
            <button className="btn-brand" onClick={() => setForm({ editId: null })}>
              <Plus size={16} />
              新建整机清单
            </button>
          )}
          <button className="btn-ghost !px-2.5" title="刷新" onClick={loadBoms}>
            {loading ? <Spinner className="!w-4 !h-4" /> : <RefreshCw size={15} />}
          </button>
        </PageHeader>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className="input !pl-9"
              placeholder="搜索产品型号 / 名称…"
              defaultValue={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                if (debounceRef.current) clearTimeout(debounceRef.current);
                debounceRef.current = setTimeout(() => { setSearch(e.target.value); setPage(1); }, 300);
              }}
            />
          </div>
          <select className="input !w-auto" value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }}>
            <option value="1">仅启用</option>
            <option value="">全部版本</option>
            <option value="0">已停用</option>
          </select>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden px-6 pb-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">
        <div className="flex min-h-0 flex-col">
          <div className="panel flex-1 overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-panel z-10">
                <tr>
                  <th className="th">产品</th>
                  <th className="th">版本</th>
                  <th className="th !text-right">物料数</th>
                  <th className="th !text-center">状态</th>
                  <th className="th">更新</th>
                  <th className="th !text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows?.map((bom) => (
                  <tr
                    key={bom.id}
                    className={`row-hover cursor-pointer ${selectedId === bom.id ? "!bg-brand/8" : ""}`}
                    onClick={() => void loadDetail(bom.id)}
                  >
                    <td className="td">
                      <div className="max-w-[280px] truncate font-medium">{productLabel(bom.product)}</div>
                      {bom.remark && <div className="max-w-[280px] truncate text-xs text-faint">{bom.remark}</div>}
                    </td>
                    <td className="td mono text-xs">{bom.version}</td>
                    <td className="td text-right">{bom.items?.length || 0}</td>
                    <td className="td text-center">
                      <Pill tone={bom.isActive ? "text-ok bg-ok/10" : "text-faint bg-steel/20"}>{bom.isActive ? "启用" : "停用"}</Pill>
                    </td>
                    <td className="td text-xs text-dim">{bom.updatedAt ? new Date(bom.updatedAt).toLocaleDateString("zh-CN") : "—"}</td>
                    <td className="td text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button className="text-faint hover:text-ink" title="查看" onClick={(e) => { e.stopPropagation(); void loadDetail(bom.id); }}><Eye size={13} /></button>
                        {canEdit && (
                          <>
                            <button className="text-faint hover:text-ink" title="编辑" onClick={(e) => { e.stopPropagation(); setForm({ editId: bom.id }); }}><Pencil size={13} /></button>
                            {bom.isActive && (
                              <button className="text-faint hover:text-bad" title="停用" onClick={(e) => { e.stopPropagation(); setDisableTarget(bom); }}><Trash2 size={13} /></button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && !rows && <div className="py-16 flex justify-center"><Spinner /></div>}
            {!loading && error && <ErrorTip message={error} onRetry={loadBoms} />}
            {!loading && !error && rows && rows.length === 0 && <Empty text="暂无整机用料清单" />}
          </div>
          {pagination.totalPages > 1 && (
            <div className="mt-2 flex items-center justify-center gap-3 py-2 text-xs text-faint">
              <button className="btn-ghost !py-1 text-xs" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</button>
              <span>第 {page} / {pagination.totalPages} 页（共 {pagination.total} 条）</span>
              <button className="btn-ghost !py-1 text-xs" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}>下一页</button>
            </div>
          )}
        </div>

        <div className="panel min-h-0 overflow-y-auto p-4">
          {!selectedId ? (
            <Empty text="选择一张清单查看明细" />
          ) : detailLoading ? (
            <div className="py-16 flex justify-center"><Spinner /></div>
          ) : detail ? (
            <div className="space-y-3">
              <div>
                <h2 className="text-base font-semibold">{detail.product?.model || detail.product?.category || "未关联产品"} 用料清单</h2>
                <p className="mt-1 text-xs text-faint">版本 {detail.version} · {detail.isActive ? "启用" : "停用"}</p>
                <p className="mt-1 text-xs leading-5 text-faint">零件包是分组；缩进的子物料数量会与零件包数量、生产台数相乘，用于工单缺料测算。</p>
              </div>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="th">物料</th>
                    <th className="th !text-right">单台用量</th>
                    <th className="th !text-center">结构</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedDetailItems.map((item) => {
                    const hasChildren = (detail.items || []).some((candidate) => candidate.parentItemId === item.id);
                    const depth = Math.max(Number(item.level || 1) - 1, 0);
                    return (
                      <tr key={item.id} className="row-hover">
                        <td className="td" style={{ paddingLeft: 14 + depth * 20 }}>
                          <div className="font-medium">{item.material?.name}</div>
                          <div className="text-xs text-faint">{item.material?.code} {item.material?.spec || ""}</div>
                        </td>
                        <td className="td text-right">{quantityText(item.quantity)} {item.material?.unit}</td>
                        <td className="td text-center">
                          <Pill tone={hasChildren ? "text-brandhi bg-brand/10" : depth > 0 ? "text-warn bg-warn/10" : "text-dim bg-steel/25"}>
                            {hasChildren ? "零件包" : depth > 0 ? "子物料" : "整机物料"}
                          </Pill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text="明细加载失败，请重选清单" />
          )}
        </div>
      </div>

      {form && (
        <BomFormSheet
          editId={form.editId}
          products={products}
          onClose={() => setForm(null)}
          onSaved={async (savedId) => {
            setForm(null);
            await loadBoms();
            if (savedId) void loadDetail(savedId);
          }}
        />
      )}

      {disableTarget && (
        <ConfirmDialog
          title="停用整机用料清单"
          message={`确定停用「${productLabel(disableTarget.product)}」版本 ${disableTarget.version}？停用后不再参与新工单。`}
          confirmText="停用"
          danger
          busy={disabling}
          onCancel={() => setDisableTarget(null)}
          onConfirm={async () => {
            setDisabling(true);
            try {
              await api(`/api/erp/boms/${disableTarget.id}`, { method: "DELETE" });
              notify("整机用料清单已停用");
              setDisableTarget(null);
              await loadBoms();
              if (selectedId === disableTarget.id) setDetail((current) => (current ? { ...current, isActive: false } : current));
            } catch (err) {
              showToast((err as Error).message, "error");
            } finally {
              setDisabling(false);
            }
          }}
        />
      )}
    </div>
  );
}

/* ---------------- 编辑弹层：树形明细 + 批量选料 ---------------- */

function BomFormSheet({
  editId,
  products,
  onClose,
  onSaved,
}: {
  editId: string | null;
  products: ErpMainProduct[];
  onClose: () => void;
  onSaved: (savedId?: string) => void | Promise<void>;
}) {
  const [productId, setProductId] = useState("");
  const [version, setVersion] = useState("v1.0");
  const [isActive, setIsActive] = useState(true);
  const [remark, setRemark] = useState("");
  const [lines, setLines] = useState<BomLine[]>([]);
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(Boolean(editId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [materials, setMaterials] = useState<ErpMaterialRow[]>([]);
  const [categories, setCategories] = useState<ErpMaterialCategoryRow[]>([]);
  const [picker, setPicker] = useState<null | { parentKey: string; onlyPackages: boolean }>(null);

  useEffect(() => {
    api<ErpMaterialRow[]>("/api/erp/materials")
      .then((data) => setMaterials(Array.isArray(data) ? data : []))
      .catch(() => setMaterials([]));
    api<ErpMaterialCategoryRow[]>("/api/erp/material-categories")
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!editId) return;
    api<ErpBomRow>(`/api/erp/boms/${editId}`)
      .then((bom) => {
        setProductId(bom.productId || "");
        setVersion(bom.version || "v1.0");
        setIsActive(bom.isActive !== false);
        setRemark(bom.remark || "");
        setLines((bom.items || []).map((item) => ({
          clientKey: item.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          parentClientKey: item.parentItemId || "",
          materialId: item.materialId,
          quantity: String(item.quantity || "1"),
        })));
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [editId]);

  const materialMap = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);
  const orderedLines = useMemo(() => orderTreeItems<BomLine>(lines, (line) => line.clientKey, (line) => line.parentClientKey), [lines]);
  const flatCategories = useMemo(() => flattenCategories(categories), [categories]);

  const removeLine = (line: BomLine) => {
    const descendants = collectDescendantKeys(line.clientKey, lines.map((item) => item.clientKey), (key) =>
      lines.find((item) => item.clientKey === key)?.parentClientKey || "",
    );
    if (descendants.length > 0) {
      if (!window.confirm(`该零件包包含 ${descendants.length} 个子节点，删除后子节点也会移除，是否继续？`)) return;
    }
    setLines((current) => current.filter((item) => item.clientKey !== line.clientKey && !descendants.includes(item.clientKey)));
  };

  const moveLine = (line: BomLine, direction: -1 | 1) => {
    setLines((current) => {
      const siblingIndexes = current
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.parentClientKey === line.parentClientKey)
        .map(({ index }) => index);
      const position = siblingIndexes.indexOf(current.findIndex((item) => item.clientKey === line.clientKey));
      const swapIndex = siblingIndexes[position + direction];
      if (swapIndex === undefined) return current;
      const index = current.findIndex((item) => item.clientKey === line.clientKey);
      const next = [...current];
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      return next;
    });
  };

  const save = async () => {
    if (!productId) return;
    const items = orderedLines
      .filter((line) => line.materialId && line.quantity)
      .map((line, index) => ({
        clientKey: line.clientKey,
        parentClientKey: line.parentClientKey || null,
        materialId: line.materialId,
        quantity: line.quantity,
        sortOrder: index * 10,
      }));
    if (items.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const saved = await api<{ id?: string }>(editId ? `/api/erp/boms/${editId}` : "/api/erp/boms", {
        method: editId ? "PUT" : "POST",
        body: { productId, version, isActive, remark, items },
      });
      notify(editId ? "整机用料清单已保存" : "整机用料清单已创建");
      await onSaved(saved.id || editId || undefined);
    } catch (err) {
      setError(displayBomError((err as Error).message));
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={editId ? "编辑整机清单" : "新建整机清单"}
      subtitle="先选择产品型号，再批量加入物料并填写单台用量"
      size="full"
      onClose={onClose}
    >
      {loading ? (
        <div className="py-16 flex justify-center"><Spinner /></div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="block md:col-span-2">
              <span className="label">产品型号 *</span>
              <SearchSelect
                className="mt-1"
                value={productId}
                onChange={setProductId}
                options={[{ value: "", label: "请选择产品型号" }, ...products.map((product) => ({ value: product.id, label: productLabel(product) }))]}
                placeholder="请选择产品型号"
              />
            </label>
            <label className="block">
              <span className="label">版本 *</span>
              <input className="input mt-1" value={version} onChange={(e) => setVersion(e.target.value)} />
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm text-dim">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              设为启用版本（同产品其余版本自动停用）
            </label>
          </div>
          <label className="block">
            <span className="label">备注</span>
            <input className="input mt-1" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="例如：BK5030 标准配置" />
          </label>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">清单明细</h3>
                <p className="mt-0.5 text-xs text-faint">已加入 {lines.length} 项物料</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost text-xs" onClick={() => setPicker({ parentKey: "", onlyPackages: true })}>
                  <Plus size={13} />
                  新建零件包分组
                </button>
                <button className="btn-ghost text-xs" onClick={() => setPicker({ parentKey: "", onlyPackages: false })}>
                  <Plus size={13} />
                  批量选择物料
                </button>
              </div>
            </div>

            {lines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line py-10 text-center text-sm text-faint">
                请选择产品型号后，点击「批量选择物料」加入清单。
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full border-collapse text-sm" style={{ minWidth: "820px" }}>
                  <thead>
                    <tr>
                      <th className="th">物料编号</th>
                      <th className="th">物料名称</th>
                      <th className="th">分类</th>
                      <th className="th">规格</th>
                      <th className="th">单位</th>
                      <th className="th !text-right">单台用量</th>
                      <th className="th !text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderedLines
                      .map((line) => ({ line, index: lines.findIndex((candidate) => candidate.clientKey === line.clientKey) }))
                      .filter(({ line }) => treeVisible(line.clientKey, (key) => lines.find((item) => item.clientKey === key)?.parentClientKey || "", (key) => lines.some((item) => item.clientKey === key), collapsedKeys))
                      .map(({ line, index }) => {
                        const material = materialMap.get(line.materialId);
                        const children = lines.filter((candidate) => candidate.parentClientKey === line.clientKey);
                        const isGroup = children.length > 0;
                        const depth = treeDepthOf(line.clientKey, (key) => lines.find((item) => item.clientKey === key)?.parentClientKey || "", (key) => lines.some((item) => item.clientKey === key));
                        const step = bomUnitStep(material?.unit);
                        return (
                          <tr key={line.clientKey} className="row-hover">
                            <td className="td mono text-xs">{material?.code || "—"}</td>
                            <td className="td">
                              <div className="flex items-center gap-1" style={{ paddingLeft: depth * 20 }}>
                                {isGroup ? (
                                  <button
                                    className="shrink-0 text-faint"
                                    title={collapsedKeys.has(line.clientKey) ? "展开" : "折叠"}
                                    onClick={() => setCollapsedKeys((current) => {
                                      const next = new Set(current);
                                      if (next.has(line.clientKey)) next.delete(line.clientKey);
                                      else next.add(line.clientKey);
                                      return next;
                                    })}
                                  >
                                    {collapsedKeys.has(line.clientKey) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                  </button>
                                ) : (
                                  <span className="inline-block w-[18px]" />
                                )}
                                <span className="font-medium">{material?.name || "未选择物料"}</span>
                                {isGroup && <Pill tone="text-brandhi bg-brand/10">虚拟零件包</Pill>}
                              </div>
                            </td>
                            <td className="td text-dim">{material?.category?.name || "—"}</td>
                            <td className="td text-dim">{material?.spec || "—"}</td>
                            <td className="td text-dim">{material?.unit || "件"}</td>
                            <td className="td text-right">
                              <div className="inline-flex items-center overflow-hidden rounded-lg border border-line">
                                <button type="button" className="px-2 py-1.5 text-faint hover:bg-panel2" onClick={() => moveQuantity(lines, index, setLines, -step)}>−</button>
                                <input
                                  className="w-20 border-x border-line bg-transparent px-2 py-1.5 text-right outline-none"
                                  type="number"
                                  min="1"
                                  step={step}
                                  value={line.quantity}
                                  onChange={(e) => updateLineAt(lines, index, setLines, { quantity: e.target.value })}
                                />
                                <button type="button" className="px-2 py-1.5 text-faint hover:bg-panel2" onClick={() => moveQuantity(lines, index, setLines, step)}>＋</button>
                              </div>
                            </td>
                            <td className="td text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button className="text-faint hover:text-ink" title="上移" onClick={() => moveLine(line, -1)}><ArrowUp size={13} /></button>
                                <button className="text-faint hover:text-ink" title="下移" onClick={() => moveLine(line, 1)}><ArrowDown size={13} /></button>
                                {isPackageMaterial(material) && (
                                  <button className="text-brandhi" title="向零件包添加子物料" onClick={() => setPicker({ parentKey: line.clientKey, onlyPackages: false })}><Plus size={13} /></button>
                                )}
                                <button className="text-faint hover:text-bad" title="删除" onClick={() => removeLine(line)}><Trash2 size={13} /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {error && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">{error}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={onClose}>取消</button>
            <button className="btn-brand" disabled={saving || !productId || lines.every((line) => !line.materialId || !line.quantity)} onClick={() => void save()}>
              {saving ? <Spinner className="!h-4 !w-4" /> : "保存"}
            </button>
          </div>
        </div>
      )}

      {picker && (
        <BomMaterialPickerSheet
          materials={materials}
          flatCategories={flatCategories}
          parentMaterial={(() => {
            const parentId = lines.find((line) => line.clientKey === picker.parentKey)?.materialId;
            return (parentId && materialMap.get(parentId)) || null;
          })()}
          existingIds={new Set(lines.filter((line) => line.parentClientKey === picker.parentKey).map((line) => line.materialId).filter(Boolean))}
          onlyPackages={picker.onlyPackages}
          onClose={() => setPicker(null)}
          onAdd={(selected) => {
            setLines((current) => [
              ...current,
              ...selected.map((item) => ({ ...makeLine(item.materialId, picker.parentKey), quantity: item.quantity })),
            ]);
            setPicker(null);
          }}
        />
      )}
    </Sheet>
  );
}

function updateLineAt(lines: BomLine[], index: number, setLines: React.Dispatch<React.SetStateAction<BomLine[]>>, patch: Partial<BomLine>) {
  setLines((current) => {
    const next = [...current];
    next[index] = { ...next[index], ...patch };
    return next;
  });
}

function moveQuantity(lines: BomLine[], index: number, setLines: React.Dispatch<React.SetStateAction<BomLine[]>>, delta: number) {
  const current = Number(lines[index].quantity || 0);
  const next = Math.max(delta >= 1 ? 1 : 0.01, Number((current + delta).toFixed(2)));
  updateLineAt(lines, index, setLines, { quantity: String(next) });
}

function BomMaterialPickerSheet({
  materials,
  flatCategories,
  parentMaterial,
  existingIds,
  onlyPackages,
  onClose,
  onAdd,
}: {
  materials: ErpMaterialRow[];
  flatCategories: FlatCategory[];
  parentMaterial: ErpMaterialRow | null;
  existingIds: ReadonlySet<string>;
  onlyPackages: boolean;
  onClose: () => void;
  onAdd: (selected: { materialId: string; quantity: string }[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  // 新建零件包分组：预筛「零件包」分类
  useEffect(() => {
    if (onlyPackages) {
      const packageCategory = flatCategories.find((category) => category.name.includes("零件包"));
      setCategoryId(packageCategory?.id || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return materials
      .filter((material) => {
        if (categoryId && material.categoryId !== categoryId) return false;
        if (!query) return true;
        return `${material.code || ""} ${material.drawingNo || ""} ${material.name || ""} ${material.spec || ""} ${material.category?.name || ""}`.toLowerCase().includes(query);
      })
      .sort((left, right) => {
        if (!query) return 0;
        const direct = (material: ErpMaterialRow) => (`${material.code || ""} ${material.drawingNo || ""} ${material.name || ""}`).toLowerCase().includes(query) ? 0 : 1;
        return direct(left) - direct(right);
      });
  }, [materials, search, categoryId]);

  const toggle = (materialId: string, checked: boolean) => {
    setSelectedIds((current) => (checked ? [...current, materialId] : current.filter((id) => id !== materialId)));
    setQuantities((current) => {
      const next = { ...current };
      if (checked) next[materialId] = next[materialId] || "1";
      else delete next[materialId];
      return next;
    });
  };

  return (
    <Sheet
      title={parentMaterial ? `向「${parentMaterial.name}」添加子物料` : "批量选择物料"}
      subtitle={`已选 ${selectedIds.length} 项；同一层级不重复加入，同一子物料可用于不同零件包`}
      size="wide"
      onClose={onClose}
    >
      <div className="space-y-3">
        {parentMaterial && (
          <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">只有物料管理中独立存在的物料才能单独设置数量；零件包规格中的文字说明不会自动拆成子物料。</p>
        )}
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input !pl-9" placeholder="按物料名称、编号/图号、规格搜索" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <SearchSelect
            className="!w-44"
            value={categoryId}
            onChange={setCategoryId}
            options={[{ value: "", label: "全部分类" }, ...flatCategories.filter((c) => c.id).map((c) => ({ value: c.id, label: c.label.trim() }))]}
            placeholder="全部分类"
          />
          <button
            className="btn-ghost text-xs"
            onClick={() => setSelectedIds(filtered.filter((material) => !existingIds.has(material.id)).map((material) => material.id))}
          >
            全选当前筛选结果
          </button>
        </div>

        <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-line">
          <table className="w-full border-collapse text-sm" style={{ minWidth: "700px" }}>
            <thead className="sticky top-0 bg-panel z-10">
              <tr>
                <th className="th !w-14 !text-center">选择</th>
                <th className="th">物料编号</th>
                <th className="th">物料名称</th>
                <th className="th">分类</th>
                <th className="th">规格</th>
                <th className="th">单位</th>
                <th className="th !text-right">加入数量</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((material) => {
                const alreadyAdded = existingIds.has(material.id);
                const checked = selectedIds.includes(material.id);
                const step = bomUnitStep(material.unit);
                return (
                  <tr key={material.id} className={`row-hover ${alreadyAdded ? "opacity-50" : ""}`}>
                    <td className="td text-center">
                      <input type="checkbox" disabled={alreadyAdded} checked={alreadyAdded || checked} onChange={(e) => toggle(material.id, e.target.checked)} />
                    </td>
                    <td className="td mono text-xs">{material.code}</td>
                    <td className="td font-medium">{material.name}</td>
                    <td className="td text-dim">{material.category?.name || "—"}</td>
                    <td className="td text-dim">{material.spec || "—"}</td>
                    <td className="td text-dim">{material.unit || "件"}</td>
                    <td className="td text-right">
                      <input
                        className="input !w-24 !py-1 text-right"
                        type="number"
                        min={step >= 1 ? "1" : "0.01"}
                        step={step}
                        disabled={alreadyAdded || !checked}
                        value={checked ? quantities[material.id] || "1" : ""}
                        onChange={(e) => setQuantities((current) => ({ ...current, [material.id]: e.target.value }))}
                      />
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="td !py-10 text-center text-faint">未找到独立物料。请先在「物料管理」中新建该物料，再返回添加并设置数量。</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button
            className="btn-brand"
            disabled={selectedIds.length === 0 || selectedIds.some((materialId) => Number(quantities[materialId] || 1) <= 0)}
            onClick={() => onAdd(selectedIds.map((materialId) => ({ materialId, quantity: quantities[materialId] || "1" })))}
          >
            加入清单
          </button>
        </div>
      </div>
    </Sheet>
  );
}
