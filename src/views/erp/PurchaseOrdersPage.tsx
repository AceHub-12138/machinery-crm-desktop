import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Eye, PackagePlus, Pencil, Plus, Search, XCircle } from "lucide-react";
import { api, getCachedUser } from "../../lib/api";
import { Pill, Spinner, Empty, ErrorTip, PageHeader, SearchSelect, ConfirmDialog, notify, showToast } from "../../components/ui";
import { ERP_PURCHASE_ORDER_STATUS } from "../../lib/erp";
import { date, money } from "../../lib/format";
import { navigate } from "../../lib/navigation";
import type { ErpMaterialRow, ErpPurchaseOrderItemRow, ErpPurchaseOrderRow, ErpSupplierRow } from "../../types";

/** 采购订单：列表 ⇄ 详情（新建/编辑草稿、按白名单流转状态、生成入库单联动） */
export default function PurchaseOrdersPage({ initialFilters }: { initialFilters?: Record<string, string | undefined> }) {
  const poId = initialFilters?.poId || "";
  if (poId) {
    return <PurchaseOrderDetail orderId={poId === "new" ? null : poId} />;
  }
  return <PurchaseOrderList />;
}

/* ---------------- 列表 ---------------- */

function PurchaseOrderList() {
  const role = getCachedUser()?.role;
  const canEdit = role === "SUPER_ADMIN" || role === "PURCHASE";
  const statusOptions = useMemo(() => {
    const entries = Object.entries(ERP_PURCHASE_ORDER_STATUS);
    if (role === "WAREHOUSE") return entries.filter(([value]) => ["ORDERED", "PARTIAL_RECEIVED", "RECEIVED"].includes(value));
    return entries;
  }, [role]);

  const [rows, setRows] = useState<ErpPurchaseOrderRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ items: ErpPurchaseOrderRow[] }>("/api/erp/purchase-orders", {
        query: { search: search.trim() || undefined, status: status || undefined, pageSize: "50" },
      });
      setRows(data.items || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <PageHeader title="采购订单" sub="采购维护订单草稿和下单流程；仓库仅查看可收货订单并通过入库模块收货">
          {canEdit && (
            <button className="btn-brand" onClick={() => navigate("/erp/purchase-orders/new")}>
              <Plus size={16} />
              新增采购订单
            </button>
          )}
        </PageHeader>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className="input !pl-9"
              placeholder="搜索采购单号或供应商"
              defaultValue={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                if (debounceRef.current) clearTimeout(debounceRef.current);
                debounceRef.current = setTimeout(() => setSearch(e.target.value), 300);
              }}
            />
          </div>
          <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部状态</option>
            {statusOptions.map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: "900px" }}>
            <thead className="sticky top-0 bg-panel z-10">
              <tr>
                <th className="th">采购单号</th>
                <th className="th">供应商</th>
                <th className="th">订单日期</th>
                <th className="th">预计到货</th>
                <th className="th !text-right">明细 / 金额</th>
                <th className="th">状态</th>
                <th className="th !w-24 !text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((order, index) => (
                <tr key={order.id} className="row-hover fade-up" style={{ animationDelay: `${Math.min(index * 20, 300)}ms` }}>
                  <td className="td mono text-xs">{order.orderNo}</td>
                  <td className="td font-medium">{order.supplierNameSnapshot || order.supplier?.name || "—"}</td>
                  <td className="td text-dim">{order.orderDate ? date(order.orderDate) : "—"}</td>
                  <td className="td text-dim">{order.expectedArrivalDate ? date(order.expectedArrivalDate) : "—"}</td>
                  <td className="td text-right">
                    <span>{order.itemCount ?? order.items?.length ?? 0} 项</span>
                    <span className="ml-3 font-medium mono">{money(order.totalAmount || 0)}</span>
                  </td>
                  <td className="td"><Pill tone={ERP_PURCHASE_ORDER_STATUS[order.status]?.tone || "text-dim bg-steel/25"}>{ERP_PURCHASE_ORDER_STATUS[order.status]?.label || order.status}</Pill></td>
                  <td className="td text-center">
                    <button className="btn-ghost !px-2 !py-1 text-xs" title="查看采购订单" onClick={() => navigate(`/erp/purchase-orders/${order.id}`)}>
                      {role === "PURCHASE" && (order.status === "DRAFT") ? <Pencil size={13} /> : <Eye size={13} />}
                      查看
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && !rows && <div className="py-16 flex justify-center"><Spinner /></div>}
          {!loading && error && <ErrorTip message={error} onRetry={load} />}
          {!loading && !error && rows && rows.length === 0 && <Empty text="暂无采购订单" />}
        </div>
      </div>
    </div>
  );
}

/* ---------------- 详情（新建 / 编辑草稿 / 状态流转 / 入库联动） ---------------- */

interface OrderLine { materialId: string; quantity: string; unitPrice: string }

function PurchaseOrderDetail({ orderId }: { orderId: string | null }) {
  const isNew = orderId === null;
  const role = getCachedUser()?.role;
  const canEdit = role === "SUPER_ADMIN" || role === "PURCHASE";

  const [order, setOrder] = useState<ErpPurchaseOrderRow | null>(null);
  const [materials, setMaterials] = useState<ErpMaterialRow[]>([]);
  const [suppliers, setSuppliers] = useState<ErpSupplierRow[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [error, setError] = useState("");
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [form, setForm] = useState<{ supplierId: string; orderDate: string; expectedArrivalDate: string; remark: string; items: OrderLine[] }>({
    supplierId: "",
    orderDate: new Date().toISOString().slice(0, 10),
    expectedArrivalDate: "",
    remark: "",
    items: [{ materialId: "", quantity: "1", unitPrice: "" }],
  });

  useEffect(() => {
    api<ErpMaterialRow[]>("/api/erp/materials")
      .then((data) => setMaterials(Array.isArray(data) ? data : []))
      .catch(() => setMaterials([]));
    api<{ items: ErpSupplierRow[] }>("/api/erp/suppliers")
      .then((data) => setSuppliers(data.items || []))
      .catch(() => setSuppliers([]));
  }, []);

  const loadOrder = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    setError("");
    try {
      const data = await api<ErpPurchaseOrderRow>(`/api/erp/purchase-orders/${orderId}`);
      setOrder(data);
      setForm({
        supplierId: data.supplierId || "",
        orderDate: data.orderDate ? new Date(data.orderDate).toISOString().slice(0, 10) : "",
        expectedArrivalDate: data.expectedArrivalDate ? new Date(data.expectedArrivalDate).toISOString().slice(0, 10) : "",
        remark: data.remark || "",
        items: (data.items || []).map((item) => ({
          materialId: item.materialId,
          quantity: String(item.quantity),
          unitPrice: String(item.unitPrice ?? ""),
        })),
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [isNew, orderId]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  const isDraft = isNew || order?.status === "DRAFT";
  const editable = canEdit && isDraft;
  const materialMap = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);
  const total = form.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);

  const updateLine = (index: number, patch: Partial<OrderLine>) => {
    setForm((current) => ({ ...current, items: current.items.map((item, idx) => (idx === index ? { ...item, ...patch } : item)) }));
  };

  const save = async () => {
    if (!editable) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        supplierId: form.supplierId,
        orderDate: form.orderDate,
        expectedArrivalDate: form.expectedArrivalDate || undefined,
        remark: form.remark,
        items: form.items.filter((item) => item.materialId),
      };
      if (isNew) {
        const created = await api<ErpPurchaseOrderRow>("/api/erp/purchase-orders", { method: "POST", body: payload });
        notify(`采购订单草稿 ${created.orderNo || ""} 已创建`);
        navigate(`/erp/purchase-orders/${created.id}`);
      } else {
        const updated = await api<ErpPurchaseOrderRow>(`/api/erp/purchase-orders/${orderId}`, { method: "PUT", body: payload });
        notify("采购订单草稿已保存");
        setOrder(updated);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: string) => {
    if (!orderId || changingStatus) return;
    setChangingStatus(true);
    setError("");
    try {
      await api(`/api/erp/purchase-orders/${orderId}/status`, { method: "POST", body: { status } });
      notify(status === "ORDERED" ? "已下单" : "采购订单已取消");
      setCancelConfirm(false);
      await loadOrder();
    } catch (err) {
      setError((err as Error).message);
      showToast((err as Error).message, "error");
    } finally {
      setChangingStatus(false);
    }
  };

  const receivedOf = (index: number) => Number(order?.items?.[index]?.receivedQuantity || 0);

  if (loading && !isNew) {
    return <div className="flex-1 flex items-center justify-center"><Spinner /></div>;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <PageHeader
          title={isNew ? "新增采购订单" : order?.orderNo || "采购订单详情"}
          sub={isNew ? "草稿保存后可继续编辑并下单" : undefined}
        >
          <button className="btn-ghost" onClick={() => navigate("/erp/purchase-orders")}>
            <ArrowLeft size={15} />
            返回采购订单
          </button>
        </PageHeader>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
        {error && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">{error}</p>}
        {!isNew && order && !isDraft && (
          <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
            该采购订单已{ERP_PURCHASE_ORDER_STATUS[order.status]?.label || order.status}，供应商和采购明细已锁定；到货状态由已确认入库单自动派生。
          </p>
        )}

        <section className="panel space-y-3 p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="block">
              <span className="label">供应商 *</span>
              <SearchSelect
                className="mt-1"
                value={form.supplierId}
                onChange={(value) => setForm((current) => ({ ...current, supplierId: value }))}
                options={[{ value: "", label: isNew ? "请选择供应商" : "—" }, ...suppliers.filter((supplier) => supplier.isActive || supplier.id === form.supplierId).map((supplier) => ({ value: supplier.id, label: supplier.name, sub: supplier.isActive === false ? "已停用" : undefined }))]}
                placeholder="请选择供应商"
                disabled={!editable}
              />
            </label>
            <label className="block">
              <span className="label">订单日期 *</span>
              <input className="input mt-1" type="date" value={form.orderDate} disabled={!editable} onChange={(e) => setForm((current) => ({ ...current, orderDate: e.target.value }))} />
            </label>
            <label className="block">
              <span className="label">预计到货日期</span>
              <input className="input mt-1" type="date" value={form.expectedArrivalDate} disabled={!editable} onChange={(e) => setForm((current) => ({ ...current, expectedArrivalDate: e.target.value }))} />
            </label>
          </div>
          <label className="block">
            <span className="label">备注</span>
            <textarea className="input mt-1" rows={2} value={form.remark} disabled={!editable} onChange={(e) => setForm((current) => ({ ...current, remark: e.target.value }))} />
          </label>
        </section>

        <section className="panel">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">采购明细</h2>
              <p className="mt-0.5 text-xs text-faint">金额由数量与单价自动计算，并在服务端重新计算后保存。</p>
            </div>
            {editable && (
              <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setForm((current) => ({ ...current, items: [...current.items, { materialId: "", quantity: "1", unitPrice: "" }] }))}>
                ＋ 添加行
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" style={{ minWidth: "900px" }}>
              <thead>
                <tr>
                  <th className="th">物料</th>
                  <th className="th">规格</th>
                  <th className="th !text-right">数量</th>
                  <th className="th !text-right">单价</th>
                  <th className="th !text-right">金额</th>
                  <th className="th !text-right">已到货 / 待入库</th>
                  {editable && <th className="th !w-16 !text-center">操作</th>}
                </tr>
              </thead>
              <tbody>
                {form.items.map((item, index) => {
                  const material = materialMap.get(item.materialId);
                  const detailItem: ErpPurchaseOrderItemRow | undefined = order?.items?.[index];
                  const received = receivedOf(index);
                  const remaining = Math.max(0, Number(item.quantity || 0) - received);
                  return (
                    <tr key={index} className="row-hover">
                      <td className="td">
                        {editable ? (
                          <SearchSelect
                            value={item.materialId}
                            onChange={(value) => updateLine(index, { materialId: value })}
                            options={[{ value: "", label: "请选择物料" }, ...materials.map((m) => ({ value: m.id, label: `${m.code} · ${m.name}`, sub: m.spec || undefined }))]}
                            placeholder="请选择物料"
                          />
                        ) : (
                          <span className="font-medium">{material ? `${material.code} - ${material.name}` : detailItem?.materialNameSnapshot || "—"}</span>
                        )}
                      </td>
                      <td className="td text-dim">{material?.spec || detailItem?.materialSpecSnapshot || "—"}</td>
                      <td className="td text-right">
                        {editable ? (
                          <input className="input !w-24 text-right" type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} />
                        ) : (
                          Number(item.quantity).toLocaleString()
                        )}
                      </td>
                      <td className="td text-right">
                        {editable ? (
                          <input className="input !w-28 text-right" type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateLine(index, { unitPrice: e.target.value })} />
                        ) : (
                          money(item.unitPrice || 0)
                        )}
                      </td>
                      <td className="td text-right font-medium mono">{money(Number(item.quantity || 0) * Number(item.unitPrice || 0))}</td>
                      <td className="td text-right text-dim">{received.toLocaleString()} / {remaining.toLocaleString()}</td>
                      {editable && (
                        <td className="td text-center">
                          {form.items.length > 1 && (
                            <button className="text-faint hover:text-bad" title="删除明细行" onClick={() => setForm((current) => ({ ...current, items: current.items.filter((_, idx) => idx !== index) }))}>删除</button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-4 py-3 text-right text-sm font-semibold">合计金额：{money(total)}</div>
        </section>

        {editable && (
          <div className="flex justify-end">
            <button
              className="btn-brand"
              disabled={saving || !form.supplierId || !form.orderDate || form.items.filter((item) => item.materialId).length === 0}
              onClick={() => void save()}
            >
              {saving ? <Spinner className="!h-4 !w-4" /> : isNew ? "创建草稿" : "保存草稿"}
            </button>
          </div>
        )}

        {!isNew && order && canEdit && (
          <div className="flex flex-wrap justify-end gap-2">
            {(order.status === "ORDERED" || order.status === "PARTIAL_RECEIVED") && (
              <button className="btn-brand" onClick={() => navigate(`/erp/stock-in?purchaseOrderId=${orderId}`)}>
                <PackagePlus size={15} />
                生成入库单
              </button>
            )}
            {order.status === "DRAFT" && (
              <>
                <button className="btn-brand" disabled={changingStatus} onClick={() => void changeStatus("ORDERED")}>下单</button>
                <button className="btn-ghost !text-bad" disabled={changingStatus} onClick={() => setCancelConfirm(true)}>
                  <XCircle size={15} />
                  取消
                </button>
              </>
            )}
            {order.status === "ORDERED" && (
              <button className="btn-ghost !text-bad" disabled={changingStatus} onClick={() => setCancelConfirm(true)}>
                <XCircle size={15} />
                取消
              </button>
            )}
          </div>
        )}
      </div>

      {cancelConfirm && (
        <ConfirmDialog
          title="取消采购订单"
          message="确认取消这张采购订单吗？取消后会释放关联的采购需求分摊，不能恢复。"
          confirmText="确认取消订单"
          danger
          busy={changingStatus}
          onCancel={() => setCancelConfirm(false)}
          onConfirm={() => void changeStatus("CANCELLED")}
        />
      )}
    </div>
  );
}
