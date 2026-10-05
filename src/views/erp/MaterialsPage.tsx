import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileDown, Pencil, Plus, RefreshCw, Search, SlidersHorizontal, Trash2, Upload } from "lucide-react";
import { api, getCachedUser } from "../../lib/api";
import { Spinner, Empty, ErrorTip, PageHeader, Sheet, ConfirmDialog, SearchSelect, notify, showToast } from "../../components/ui";
import { ERP_MATERIAL_UNITS, flattenCategories } from "../../lib/erp";
import { money } from "../../lib/format";
import { MaterialImportDialog, downloadMaterialImportTemplate } from "./MaterialImportDialog";
import type { ErpMaterialCategoryRow, ErpMaterialRow } from "../../types";

interface SupplierBrief { id: string; name: string; isActive?: boolean }

const EMPTY_FORM = {
  code: "", name: "", categoryId: "", spec: "", unit: "件", standardPrice: "", safetyStock: "",
  procurementLeadDays: "0", safetyStockEnabled: false, autoPurchaseDraftEnabled: false,
  supplier: "", supplierId: "", remark: "",
};

/** 物料管理：CRUD + 分类预警线 + Excel 模板/导入（对齐平台 /erp/materials） */
export default function MaterialsPage() {
  const [rows, setRows] = useState<ErpMaterialRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<ErpMaterialCategoryRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierBrief[]>([]);
  const [form, setForm] = useState<null | { mode: "create" } | { mode: "edit"; material: ErpMaterialRow }>(null);
  const [deleteTarget, setDeleteTarget] = useState<ErpMaterialRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadRequestRef = useRef(0);
  const canEdit = getCachedUser()?.role === "SUPER_ADMIN" || getCachedUser()?.role === "WAREHOUSE";

  const flatCategories = useMemo(() => flattenCategories(categories), [categories]);
  const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const categoryOptions = useMemo(
    () => [{ value: "", label: "全部分类" }, ...flatCategories.map((c) => ({ value: c.id, label: c.label }))],
    [flatCategories],
  );

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const data = await api<ErpMaterialRow[]>("/api/erp/materials", {
        query: { search: search.trim() || undefined, categoryId: categoryId || undefined },
      });
      if (requestId !== loadRequestRef.current) return;
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      if (requestId === loadRequestRef.current) setError((err as Error).message);
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [search, categoryId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => {
    loadRequestRef.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const data = await api<ErpMaterialCategoryRow[]>("/api/erp/material-categories");
      setCategories(Array.isArray(data) ? data : []);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
    api<SupplierBrief[]>("/api/erp/suppliers")
      .then((data) => setSuppliers(Array.isArray(data) ? data : []))
      .catch(() => setSuppliers([]));
  }, [loadCategories]);

  const onSearchInput = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(value), 400);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <PageHeader title="物料管理" sub="整机用料清单与出入库共用的物料主数据；预警口径：物料安全库存优先，其次分类预警线">
          {canEdit && (
            <>
              <button className="btn-ghost" onClick={() => void downloadMaterialImportTemplate()}>
                <FileDown size={15} />
                下载导入模板
              </button>
              <button className="btn-ghost" onClick={() => setShowImport(true)}>
                <Upload size={15} />
                Excel 导入
              </button>
              <button className="btn-ghost" onClick={() => setShowWarning(true)}>
                <SlidersHorizontal size={15} />
                分类预警设置
              </button>
              <button className="btn-brand" onClick={() => setForm({ mode: "create" })}>
                <Plus size={16} />
                新增物料
              </button>
            </>
          )}
          <button className="btn-ghost !px-2.5" title="刷新" onClick={load}>
            {loading ? <Spinner className="!w-4 !h-4" /> : <RefreshCw size={15} />}
          </button>
        </PageHeader>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input !pl-9" placeholder="搜索物料名称/编码/图号…" defaultValue={searchInput} onChange={(e) => onSearchInput(e.target.value)} />
          </div>
          <SearchSelect className="!w-48" value={categoryId} onChange={setCategoryId} options={categoryOptions} placeholder="全部分类" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: "920px" }}>
            <thead className="sticky top-0 bg-panel z-10">
              <tr>
                <th className="th">编码</th>
                <th className="th">名称</th>
                <th className="th">分类</th>
                <th className="th">规格</th>
                <th className="th">供货商</th>
                <th className="th !text-right">标准价</th>
                <th className="th !text-right">安全库存</th>
                <th className="th !text-center">单位</th>
                {canEdit && <th className="th !w-24 !text-center">操作</th>}
              </tr>
            </thead>
            <tbody>
              {rows?.map((material, index) => (
                <tr key={material.id} className="row-hover fade-up" style={{ animationDelay: `${Math.min(index * 20, 300)}ms` }}>
                  <td className="td mono text-xs">{material.code}</td>
                  <td className="td font-medium">{material.name}</td>
                  <td className="td text-dim">{material.category?.name || "—"}</td>
                  <td className="td text-dim">{material.spec || "—"}</td>
                  <td className="td text-dim">{supplierById.get(material.supplierId || "")?.name || material.supplier || "—"}</td>
                  <td className="td text-right mono">{material.standardPrice ? money(material.standardPrice) : "—"}</td>
                  <td className="td text-right">{material.safetyStock ? Number(material.safetyStock).toLocaleString() : "—"}</td>
                  <td className="td text-center text-dim">{material.unit}</td>
                  {canEdit && (
                    <td className="td text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button className="text-faint hover:text-ink" title="编辑" onClick={() => setForm({ mode: "edit", material })}><Pencil size={13} /></button>
                        <button className="text-faint hover:text-bad" title="删除" onClick={() => setDeleteTarget(material)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {loading && !rows && <div className="py-16 flex justify-center"><Spinner /></div>}
          {!loading && error && <ErrorTip message={error} onRetry={load} />}
          {!loading && !error && rows && rows.length === 0 && <Empty text="暂无物料" />}
        </div>
      </div>

      {form && (
        <MaterialFormSheet
          material={form.mode === "edit" ? form.material : null}
          categories={flatCategories}
          suppliers={suppliers}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void load();
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="删除物料"
          message={`确定删除物料「${deleteTarget.code} ${deleteTarget.name}」？删除为软删除，已被 BOM/单据引用的历史数据不受影响；其编码之后可重新使用，新增同编码物料会自动恢复这条记录及其历史账目。`}
          confirmText="删除"
          danger
          busy={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            setDeleting(true);
            try {
              await api(`/api/erp/materials/${deleteTarget.id}`, { method: "DELETE" });
              notify("物料已删除");
              setDeleteTarget(null);
              void load();
            } catch (err) {
              showToast((err as Error).message, "error");
            } finally {
              setDeleting(false);
            }
          }}
        />
      )}

      {showWarning && (
        <CategoryWarningSheet
          categories={categories}
          flatCategories={flatCategories}
          onClose={() => setShowWarning(false)}
          onSaved={() => {
            setShowWarning(false);
            void loadCategories();
          }}
        />
      )}

      {showImport && (
        <Sheet title="Excel 导入物料" subtitle="两步确认：先预览差异，再确认写入" size="wide" onClose={() => setShowImport(false)}>
          <MaterialImportDialog
            categories={categories}
            onClose={() => setShowImport(false)}
            onImported={() => load()}
          />
        </Sheet>
      )}
    </div>
  );
}

function MaterialFormSheet({
  material,
  categories,
  suppliers,
  onClose,
  onSaved,
}: {
  material: ErpMaterialRow | null;
  categories: { id: string; label: string }[];
  suppliers: SupplierBrief[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() => {
    if (!material) return { ...EMPTY_FORM };
    return {
      code: material.code || "",
      name: material.name || "",
      categoryId: material.categoryId || "",
      spec: material.spec || "",
      unit: material.unit || "件",
      standardPrice: material.standardPrice ? String(material.standardPrice) : "",
      safetyStock: material.safetyStock ? String(material.safetyStock) : "",
      procurementLeadDays: String(material.procurementLeadDays ?? 0),
      safetyStockEnabled: Boolean(material.safetyStockEnabled),
      autoPurchaseDraftEnabled: Boolean(material.autoPurchaseDraftEnabled),
      supplier: material.supplier || "",
      supplierId: material.supplierId || "",
      remark: material.remark || "",
    };
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.categoryId) return;
    setSaving(true);
    setError("");
    try {
      const saved = await api<any>(material ? `/api/erp/materials/${material.id}` : "/api/erp/materials", {
        method: material ? "PUT" : "POST",
        body: form,
      });
      if (saved?.revived) {
        const stockCount = Number(saved.revivedStock || 0);
        notify(`编码 ${form.code} 曾用于已删除物料，已自动恢复并按本次填写更新信息${stockCount > 0 ? `（账面原有库存 ${stockCount} ${saved.unit || "件"}）` : ""}`);
      } else if (saved?.releasedFrom) {
        notify(`原占用编码 ${saved.releasedFrom} 的已删除记录已自动改名让位，本次修改已保存`);
      } else {
        notify(material ? "物料已更新" : "物料已创建");
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={material ? "编辑物料" : "新增物料"}
      subtitle="编码、名称、分类为必填"
      onClose={onClose}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">编码 *</span>
            <input className="input mt-1" value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="如 JSCJ-0001" />
          </label>
          <label className="block">
            <span className="label">名称 *</span>
            <input className="input mt-1" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className="label">分类 *</span>
          <SearchSelect
            className="mt-1"
            value={form.categoryId}
            onChange={(value) => set("categoryId", value)}
            options={[{ value: "", label: "请选择分类" }, ...categories.filter((c) => c.id).map((c) => ({ value: c.id, label: c.label.trim() }))]}
            placeholder="请选择分类"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">规格</span>
            <input className="input mt-1" value={form.spec} onChange={(e) => set("spec", e.target.value)} />
          </label>
          <label className="block">
            <span className="label">单位</span>
            <select className="input mt-1" value={form.unit} onChange={(e) => set("unit", e.target.value)}>
              {ERP_MATERIAL_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">标准价</span>
            <input className="input mt-1" type="number" min="0" value={form.standardPrice} onChange={(e) => set("standardPrice", e.target.value)} />
          </label>
          <label className="block">
            <span className="label">安全库存</span>
            <input className="input mt-1" type="number" min="0" value={form.safetyStock} onChange={(e) => set("safetyStock", e.target.value)} />
          </label>
          <label className="block">
            <span className="label">默认采购提前期（天）</span>
            <input className="input mt-1" type="number" min="0" value={form.procurementLeadDays} onChange={(e) => set("procurementLeadDays", e.target.value)} />
          </label>
        </div>
        <div className="space-y-1.5 rounded-lg bg-panel2/60 px-3 py-2.5">
          <CheckLine checked={form.safetyStockEnabled} onChange={(v) => set("safetyStockEnabled", v)} label="启用安全库存（参与预警与采购计划）" />
          <CheckLine checked={form.autoPurchaseDraftEnabled} onChange={(v) => set("autoPurchaseDraftEnabled", v)} label="允许自动生成采购需求草稿" />
          <p className="text-xs leading-5 text-faint">
            预警口径：勾选「启用安全库存」后，库存 ≤ 安全库存即预警；未勾选时按「分类预警设置」的分类预警线预警；安全库存留空或 0 表示不按物料级预警。
          </p>
        </div>
        <label className="block">
          <span className="label">关联供应商</span>
          <SearchSelect
            className="mt-1"
            value={form.supplierId}
            onChange={(value) => set("supplierId", value)}
            options={[{ value: "", label: "不关联" }, ...suppliers.filter((supplier) => supplier.isActive !== false || supplier.id === form.supplierId).map((supplier) => ({ value: supplier.id, label: supplier.name, sub: supplier.isActive === false ? "已停用" : undefined }))]}
            placeholder="不关联"
          />
        </label>
        <label className="block">
          <span className="label">历史手填供货商（兼容旧数据）</span>
          <input className="input mt-1" value={form.supplier} onChange={(e) => set("supplier", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">备注</span>
          <textarea className="input mt-1" rows={2} value={form.remark} onChange={(e) => set("remark", e.target.value)} />
        </label>
        {error && <p className="text-xs text-bad">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-brand" disabled={saving || !form.code.trim() || !form.name.trim() || !form.categoryId} onClick={() => void save()}>
            {saving ? <Spinner className="!h-4 !w-4" /> : "保存"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function CategoryWarningSheet({
  categories,
  flatCategories,
  onClose,
  onSaved,
}: {
  categories: ErpMaterialCategoryRow[];
  flatCategories: { id: string; label: string; warningThreshold?: number | null }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(flatCategories.map((cat) => [cat.id, cat.warningThreshold !== null && cat.warningThreshold !== undefined ? String(cat.warningThreshold) : ""])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // categories 仅用于触发依赖；flatCategories 由它派生
  void categories;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      for (const cat of flatCategories) {
        await api(`/api/erp/material-categories/${cat.id}`, {
          method: "PATCH",
          body: { warningThreshold: draft[cat.id] ?? "" },
        });
      }
      notify("分类预警线已保存");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title="分类预警设置" subtitle="某分类库存 ≤ 此数量时预警；留空表示该分类不预警" onClose={onClose}>
      <div className="space-y-2">
        <p className="rounded-lg bg-panel2/60 px-3 py-2 text-xs leading-5 text-faint">
          物料勾选「启用安全库存」并填写安全库存时，优先按物料值预警；未勾选的物料按此处分类预警线预警。
        </p>
        {flatCategories.map((cat) => (
          <div key={cat.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-dim">{cat.label}</span>
            <input
              className="input !w-40"
              type="number"
              min="0"
              placeholder="留空不预警"
              value={draft[cat.id] ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, [cat.id]: event.target.value }))}
            />
          </div>
        ))}
        {error && <p className="text-xs text-bad">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-brand" disabled={saving} onClick={() => void save()}>
            {saving ? <Spinner className="!h-4 !w-4" /> : "保存"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function CheckLine({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-dim">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
