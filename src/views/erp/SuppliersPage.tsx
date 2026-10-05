import { useCallback, useEffect, useRef, useState } from "react";
import { Ban, Pencil, Plus, Search } from "lucide-react";
import { api, getCachedUser } from "../../lib/api";
import { Pill, Spinner, Empty, ErrorTip, PageHeader, Sheet, ConfirmDialog, notify, showToast } from "../../components/ui";
import type { ErpSupplierRow } from "../../types";

/** 供应商管理：新增/编辑/停用；停用仅关闭使用资格，历史数据保留（对齐平台 /erp/suppliers） */
export default function SuppliersPage() {
  const canEdit = getCachedUser()?.role === "SUPER_ADMIN" || getCachedUser()?.role === "PURCHASE";
  const [rows, setRows] = useState<ErpSupplierRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<null | { mode: "create" } | { mode: "edit"; supplier: ErpSupplierRow }>(null);
  const [disableTarget, setDisableTarget] = useState<ErpSupplierRow | null>(null);
  const [disabling, setDisabling] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ items: ErpSupplierRow[] }>("/api/erp/suppliers", { query: { search: search.trim() || undefined } });
      setRows(data.items || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <PageHeader title="供应商管理" sub="停用仅关闭使用资格，已关联的历史物料和采购订单不会被删除">
          {canEdit && (
            <button className="btn-brand" onClick={() => setForm({ mode: "create" })}>
              <Plus size={16} />
              新增供应商
            </button>
          )}
        </PageHeader>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className="input !pl-9"
              placeholder="搜索名称、联系人、电话或主营品类"
              defaultValue={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                if (debounceRef.current) clearTimeout(debounceRef.current);
                debounceRef.current = setTimeout(() => setSearch(e.target.value), 300);
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: "860px" }}>
            <thead className="sticky top-0 bg-panel z-10">
              <tr>
                <th className="th">供应商名称</th>
                <th className="th">联系人</th>
                <th className="th">电话 / 微信</th>
                <th className="th">主营品类</th>
                <th className="th">状态</th>
                {canEdit && <th className="th !w-24 !text-center">操作</th>}
              </tr>
            </thead>
            <tbody>
              {rows?.map((supplier, index) => (
                <tr key={supplier.id} className="row-hover fade-up" style={{ animationDelay: `${Math.min(index * 20, 300)}ms` }}>
                  <td className="td font-medium">{supplier.name}</td>
                  <td className="td text-dim">{supplier.contactName || "—"}</td>
                  <td className="td text-dim">{supplier.phone || supplier.wechat || "—"}</td>
                  <td className="td text-dim">{supplier.mainCategory || "—"}</td>
                  <td className="td"><Pill tone={supplier.isActive ? "text-ok bg-ok/10" : "text-faint bg-steel/20"}>{supplier.isActive ? "启用" : "已停用"}</Pill></td>
                  {canEdit && (
                    <td className="td text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button className="text-faint hover:text-ink" title="编辑" onClick={() => setForm({ mode: "edit", supplier })}><Pencil size={13} /></button>
                        {supplier.isActive && (
                          <button className="text-faint hover:text-bad" title="停用" onClick={() => setDisableTarget(supplier)}><Ban size={13} /></button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {loading && !rows && <div className="py-16 flex justify-center"><Spinner /></div>}
          {!loading && error && <ErrorTip message={error} onRetry={load} />}
          {!loading && !error && rows && rows.length === 0 && <Empty text="暂无供应商" />}
        </div>
      </div>

      {form && (
        <SupplierFormSheet
          supplier={form.mode === "edit" ? form.supplier : null}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void load();
          }}
        />
      )}

      {disableTarget && (
        <ConfirmDialog
          title="停用供应商"
          message={`确定停用供应商「${disableTarget.name}」吗？已关联的历史物料和采购订单不会被删除。`}
          confirmText="停用"
          danger
          busy={disabling}
          onCancel={() => setDisableTarget(null)}
          onConfirm={() => void (async () => {
            setDisabling(true);
            try {
              await api(`/api/erp/suppliers/${disableTarget.id}`, { method: "DELETE" });
              notify("供应商已停用");
              setDisableTarget(null);
              void load();
            } catch (err) {
              showToast((err as Error).message, "error");
            } finally {
              setDisabling(false);
            }
          })()}
        />
      )}
    </div>
  );
}

function SupplierFormSheet({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: ErpSupplierRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: supplier?.name || "",
    contactName: supplier?.contactName || "",
    phone: supplier?.phone || "",
    wechat: supplier?.wechat || "",
    email: supplier?.email || "",
    address: supplier?.address || "",
    mainCategory: supplier?.mainCategory || "",
    remark: supplier?.remark || "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const contactRequired = !supplier;

  const save = async () => {
    if (!form.name.trim() || (contactRequired && (!form.contactName.trim() || !form.phone.trim()))) return;
    setSaving(true);
    setError("");
    try {
      await api(supplier ? `/api/erp/suppliers/${supplier.id}` : "/api/erp/suppliers", {
        method: supplier ? "PUT" : "POST",
        body: form,
      });
      notify(supplier ? "供应商已更新" : "供应商已创建");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Sheet title={supplier ? "编辑供应商" : "新增供应商"} subtitle="名称、联系人和联系电话为新建必填" onClose={onClose}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="label">供应商名称 *</span>
          <input className="input mt-1" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">联系人{contactRequired ? " *" : ""}</span>
          <input className="input mt-1" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">联系电话{contactRequired ? " *" : ""}</span>
          <input className="input mt-1" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">微信</span>
          <input className="input mt-1" value={form.wechat} onChange={(e) => set("wechat", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">邮箱</span>
          <input className="input mt-1" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </label>
        <label className="block md:col-span-2">
          <span className="label">主营品类</span>
          <input className="input mt-1" value={form.mainCategory} onChange={(e) => set("mainCategory", e.target.value)} />
        </label>
        <label className="block md:col-span-2">
          <span className="label">地址</span>
          <input className="input mt-1" value={form.address} onChange={(e) => set("address", e.target.value)} />
        </label>
        <label className="block md:col-span-2">
          <span className="label">备注</span>
          <textarea className="input mt-1" rows={3} value={form.remark} onChange={(e) => set("remark", e.target.value)} />
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>取消</button>
        <button
          className="btn-brand"
          disabled={saving || !form.name.trim() || (contactRequired && (!form.contactName.trim() || !form.phone.trim()))}
          onClick={() => void save()}
        >
          {saving ? <Spinner className="!h-4 !w-4" /> : "保存"}
        </button>
      </div>
    </Sheet>
  );
}
