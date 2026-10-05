import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, RefreshCw, Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import { api, getCachedUser } from "../../lib/api";
import { Pill, Spinner, Empty, ErrorTip, PageHeader, Sheet, ConfirmDialog, Field, Dash } from "../../components/ui";
import { notify, showToast } from "../../components/ui";
import type { ErpWarehouseRow } from "../../types";

/** 仓库设置：卡片墙 + 新增/编辑/停用（对齐平台 /erp/warehouse） */
export default function WarehousePage() {
  const [rows, setRows] = useState<ErpWarehouseRow[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<null | { mode: "create" } | { mode: "edit"; warehouse: ErpWarehouseRow }>(null);
  const [saving, setSaving] = useState(false);
  const [disableTarget, setDisableTarget] = useState<ErpWarehouseRow | null>(null);
  const [disabling, setDisabling] = useState(false);
  const canEdit = getCachedUser()?.role === "SUPER_ADMIN" || getCachedUser()?.role === "WAREHOUSE";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<ErpWarehouseRow[]>("/api/erp/warehouses");
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <PageHeader title="仓库设置" sub="维护入库/出库/调拨/盘点使用的仓库档案；停用后不可再选，历史单据保留">
          {canEdit && (
            <button className="btn-brand" onClick={() => setForm({ mode: "create" })}>
              <Plus size={16} />
              新增仓库
            </button>
          )}
          <button className="btn-ghost !px-2.5" title="刷新" onClick={load}>
            {loading ? <Spinner className="!w-4 !h-4" /> : <RefreshCw size={15} />}
          </button>
        </PageHeader>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {loading && !rows && (
          <div className="py-16 flex justify-center"><Spinner /></div>
        )}
        {!loading && error && <ErrorTip message={error} onRetry={load} />}
        {!loading && !error && rows && rows.length === 0 && <Empty text="暂无仓库" />}
        {rows && rows.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((warehouse, index) => (
              <div key={warehouse.id} className="panel fade-up p-5" style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-panel2 text-faint">
                    <WarehouseIcon size={20} strokeWidth={1.6} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{warehouse.name}</span>
                      <Pill tone={warehouse.isActive ? "text-ok bg-ok/10" : "text-faint bg-steel/20"}>
                        {warehouse.isActive ? "启用" : "停用"}
                      </Pill>
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-faint">编码：{warehouse.code}</p>
                    {warehouse.address && <p className="mt-1 truncate text-xs text-dim" title={warehouse.address}>{warehouse.address}</p>}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-faint">{warehouse._count?.inventories ?? 0} 种物料</span>
                      {canEdit && (
                        <div className="flex items-center gap-1.5">
                          <button className="text-faint transition-colors hover:text-ink" title="编辑" onClick={() => setForm({ mode: "edit", warehouse })}>
                            <Pencil size={14} />
                          </button>
                          {warehouse.isActive && (
                            <button className="text-faint transition-colors hover:text-bad" title="停用" onClick={() => setDisableTarget(warehouse)}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {form && (
        <WarehouseFormSheet
          warehouse={form.mode === "edit" ? form.warehouse : null}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void load();
          }}
        />
      )}

      {disableTarget && (
        <ConfirmDialog
          title="停用仓库"
          message={`确定停用仓库「${disableTarget.name}」？停用后不可再选入新单据，历史单据与台账保留。${(disableTarget._count?.inventories ?? 0) > 0 ? "该仓库仍有库存记录，平台会拒绝停用。" : ""}`}
          confirmText="停用"
          danger
          busy={disabling}
          onCancel={() => setDisableTarget(null)}
          onConfirm={async () => {
            setDisabling(true);
            try {
              await api(`/api/erp/warehouses/${disableTarget.id}`, { method: "DELETE" });
              notify("仓库已停用");
              setDisableTarget(null);
              void load();
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

function WarehouseFormSheet({
  warehouse,
  onClose,
  onSaved,
}: {
  warehouse: ErpWarehouseRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(warehouse?.name || "");
  const [code, setCode] = useState(warehouse?.code || "");
  const [address, setAddress] = useState(warehouse?.address || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !code.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api(warehouse ? `/api/erp/warehouses/${warehouse.id}` : "/api/erp/warehouses", {
        method: warehouse ? "PUT" : "POST",
        body: { name: name.trim(), code: code.trim(), address: address.trim() },
      });
      notify(warehouse ? "仓库已更新" : "仓库已创建");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Sheet title={warehouse ? "编辑仓库" : "新增仓库"} subtitle="名称与编码为必填" onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="label">仓库名称 *</span>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：大川成品仓" />
        </label>
        <label className="block">
          <span className="label">仓库编码 *</span>
          <input className="input mt-1" value={code} onChange={(e) => setCode(e.target.value)} placeholder="如：DC-FG" />
        </label>
        <label className="block">
          <span className="label">地址</span>
          <input className="input mt-1" value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        {warehouse && (
          <Field label="物料种类数">{warehouse._count?.inventories ?? <Dash />}</Field>
        )}
        {error && <p className="text-xs text-bad">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-brand" disabled={saving || !name.trim() || !code.trim()} onClick={() => void save()}>
            {saving ? <Spinner className="!h-4 !w-4" /> : "保存"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
