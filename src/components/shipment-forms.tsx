import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Paperclip } from "lucide-react";
import { api, uploadFile } from "../lib/api";
import { SHIPMENT_STATUS, label } from "../lib/format";
import { Sheet, Spinner, notify, SearchSelect, ConfirmDialog } from "./ui";
import { openAttachmentPreview } from "./attachment-preview";
import { attachmentName } from "../lib/attachments";
import { shipmentProgress, type ShipmentItemLike, type ShipmentRecordLike } from "../lib/shipments";
import type { ShipmentRow } from "../types";

function today(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 发货记录附带的两份上传附件（types.ts 只读，故在本地扩展） */
export interface ShipmentLike extends ShipmentRow {
  deliveryNoteUrl?: string | null;
  shipmentPhotoUrl?: string | null;
}

interface ContractOption {
  id: string;
  contractNo: string;
  equipmentName: string;
  equipmentModel: string;
  customer: { id: string; companyName: string } | null;
}

/** /api/contracts/[id] 返回的合同明细（取产品明细用，与平台发货页一致） */
interface ContractItem extends ShipmentItemLike {
  id?: string;
  productNameSnapshot?: string | null;
  productModelSnapshot?: string | null;
  sortOrder?: number | null;
}

interface ContractDetail {
  equipmentName?: string | null;
  equipmentModel?: string | null;
  items?: ContractItem[] | null;
  /** 该合同已有发货记录：用于算「还剩几台可发」与超量校验 */
  shipments?: (ShipmentRecordLike & { id: string })[] | null;
}

/**
 * 与平台 shipments/page.tsx 的 contractEquipmentLabel 完全一致：
 * 优先拼接合同 MAIN 明细的「产品名 型号」（顿号分隔），否则回退合同 equipmentName / equipmentModel。
 */
export function composeEquipmentName(contract: ContractDetail | null | undefined): string {
  const mainItems = (contract?.items || []).filter((item) => item.itemType === "MAIN");
  if (mainItems.length) {
    return mainItems
      .map((item) => `${item.productNameSnapshot || ""} ${item.productModelSnapshot || ""}`.trim())
      .join("、");
  }
  return contract?.equipmentName || contract?.equipmentModel || "";
}

/** 打开发货附件（发货单/发货照片）：经主进程会话取回后在应用内预览 */
export function openShipmentAttachment(uploadPath?: string | null, labelText?: string): void {
  if (!uploadPath) return;
  openAttachmentPreview({ path: uploadPath, label: labelText });
}

/** 服务端搜索权限内合同（复用平台 /api/after-sales/contracts 下拉接口，含客户/设备信息） */
function useContractSearch() {
  const [items, setItems] = useState<ContractOption[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const query = useCallback((keyword: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api<{ items: ContractOption[] }>("/api/after-sales/contracts", {
          query: { q: keyword || undefined },
        });
        setItems(res.items || []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  }, []);

  const options = items.map((c) => ({
    value: c.id,
    label: `${c.contractNo} · ${c.customer?.companyName || "—"}`,
    sub: [c.equipmentName, c.equipmentModel].filter(Boolean).join(" / ") || undefined,
  }));

  return { items, options, loading, query };
}

/** 发货登记 / 编辑：创建时选合同，编辑时合同锁定只改物流信息与状态 */
export function ShipmentFormSheet({
  shipment,
  onClose,
  onSaved,
}: {
  shipment: ShipmentLike | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!shipment;
  const { items: contractItems, options: contractOptions, loading: contractLoading, query: queryContracts } = useContractSearch();
  const [contractId, setContractId] = useState("");
  const [f, setF] = useState({
    shipmentDate: shipment?.shipmentDate ? String(shipment.shipmentDate).slice(0, 10) : today(),
    receivingAddress: shipment?.receivingAddress || "",
    driverPhone: shipment?.driverPhone || "",
    equipmentName: shipment?.equipmentName || "",
    quantity: String(shipment?.quantity ?? 1),
    shipmentStatus: shipment?.shipmentStatus || "NOT_SHIPPED",
    deliveryNoteUrl: shipment?.deliveryNoteUrl || "",
    shipmentPhotoUrl: shipment?.shipmentPhotoUrl || "",
    remark: shipment?.remark || "",
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"" | "docs" | "photos">("");
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  // 数量被人工改过之后，切换合同不再覆盖用户的输入
  const [quantityTouched, setQuantityTouched] = useState(false);
  // 超量登记需二次确认：先拦下来问一句，确认后才真的提交
  const [overConfirm, setOverConfirm] = useState<null | { quantity: number }>(null);
  const pickedContractRef = useRef("");
  const set = (k: keyof typeof f, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  /**
   * 该合同「还能发几台」：合同台数 − 已发出台数。
   * 编辑既有记录时要把这条记录自己从已发台数里剔除，否则自己的数量会被算两遍。
   */
  const availability = (source: ContractDetail | null) => {
    if (!source) return null;
    const others = (source.shipments || []).filter((item) => item.id !== shipment?.id);
    return shipmentProgress({ items: source.items, shipments: others });
  };

  const currentAvailability = availability(detail);

  // 首次打开先拉一页合同，避免下拉是空的；编辑时把该合同的明细拉回来做超量校验
  useEffect(() => {
    if (!editing) queryContracts("");
  }, [editing, queryContracts]);

  useEffect(() => {
    const id = shipment?.contract?.id;
    if (!editing || !id) return;
    let alive = true;
    api<ContractDetail>(`/api/contracts/${id}`)
      .then((res) => {
        if (alive) setDetail(res);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [editing, shipment?.contract?.id]);

  /**
   * 选中合同后自动带出设备名称与本次可发数量：拉取合同明细，按平台规则拼接
   * MAIN 明细的「产品名 型号」作为设备名；数量默认填「待发台数」（合同台数 − 已发出），
   * 用户改过数量就不再覆盖。拉取失败时回退到下拉项内置的 equipmentName / equipmentModel。
   */
  const pickContract = async (id: string) => {
    setContractId(id);
    pickedContractRef.current = id;
    const found = contractItems.find((c) => c.id === id);
    const fallback = [found?.equipmentName, found?.equipmentModel].filter(Boolean).join(" ").trim();
    try {
      const res = await api<ContractDetail>(`/api/contracts/${id}`);
      if (pickedContractRef.current !== id) return;
      setDetail(res);
      const composed = composeEquipmentName(res);
      const progress = availability(res);
      setF((prev) => {
        const next = { ...prev };
        if (composed || fallback) next.equipmentName = composed || fallback || prev.equipmentName;
        if (!quantityTouched && progress?.remaining != null && progress.remaining > 0) next.quantity = String(progress.remaining);
        return next;
      });
    } catch {
      if (pickedContractRef.current !== id) return;
      setDetail(null);
      if (fallback && !quantityTouched) setF((prev) => ({ ...prev, equipmentName: prev.equipmentName || fallback }));
    }
  };

  /** 上传发货单（docs）或发货照片（photos），字段名与平台 /api/upload/shipments 一致 */
  const upload = async (file: File | undefined, type: "docs" | "photos") => {
    if (!file) return;
    setErr("");
    setUploading(type);
    try {
      const result = await uploadFile<{ url: string; fileName: string }>("/api/upload/shipments", file, { type });
      setF((prev) => (type === "docs" ? { ...prev, deliveryNoteUrl: result.url } : { ...prev, shipmentPhotoUrl: result.url }));
      notify(type === "docs" ? "发货单已上传，保存后生效" : "发货照片已上传，保存后生效");
    } catch (error) {
      setErr((error as Error).message || "上传失败");
    } finally {
      setUploading("");
    }
  };

  const save = async (quantity: number) => {
    const body = {
      shipmentDate: f.shipmentDate,
      receivingAddress: f.receivingAddress.trim(),
      driverPhone: f.driverPhone.trim(),
      equipmentName: f.equipmentName.trim(),
      quantity,
      shipmentStatus: f.shipmentStatus,
      deliveryNoteUrl: f.deliveryNoteUrl || null,
      shipmentPhotoUrl: f.shipmentPhotoUrl || null,
      remark: f.remark.trim() || null,
    };
    if (editing) await api(`/api/shipments/${shipment!.id}`, { method: "PUT", body });
    else await api("/api/shipments", { method: "POST", body: { contractId, ...body } });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setErr("");
    if (!editing && !contractId) {
      setErr("请选择关联合同");
      return;
    }
    const quantity = Number(f.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setErr("发货数量需大于 0");
      return;
    }
    if (!f.shipmentDate) {
      setErr("请选择发货日期");
      return;
    }
    if (!f.receivingAddress.trim() || !f.driverPhone.trim() || !f.equipmentName.trim()) {
      setErr("收货地址、司机电话、发货设备为必填项");
      return;
    }
    // 超出合同未发数量：不直接拒绝，先让用户二次确认（数据异常时仍允许登记，但要留痕）
    const progress = currentAvailability;
    if (progress?.remaining != null && quantity > progress.remaining) {
      setOverConfirm({ quantity });
      return;
    }
    void runSave(quantity);
  };

  const runSave = async (quantity: number) => {
    setSaving(true);
    try {
      await save(quantity);
      notify(editing ? "发货记录已更新" : "发货登记完成");
      onSaved();
      onClose();
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={editing ? "编辑发货记录" : "登记发货"}
      subtitle={editing ? "合同关联不可修改，可更新物流信息与状态" : "选择合同后自动带出设备名称"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {err && <div className="rounded-lg border border-bad/25 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          {editing ? (
            <div className="flex flex-col gap-1.5 col-span-2">
              <span className="label">关联合同</span>
              <div className="panel px-3.5 py-2.5 text-sm">
                <span className="mono text-xs text-dim">{shipment!.contract?.contractNo || "—"}</span>
                <span className="ml-2">{shipment!.contract?.customer?.companyName || "—"}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 col-span-2">
              <span className="label">关联合同 *</span>
              <SearchSelect
                value={contractId}
                onChange={pickContract}
                onQuery={queryContracts}
                loading={contractLoading}
                options={contractOptions}
                placeholder="输入合同号 / 客户 / 设备型号搜索"
                searchPlaceholder="如：S2608 或 济南德鑫…"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="label">发货日期 *</span>
            <input className="input" type="date" value={f.shipmentDate} onChange={(e) => set("shipmentDate", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">发货状态</span>
            <select className="input" value={f.shipmentStatus} onChange={(e) => set("shipmentStatus", e.target.value)}>
              {Object.keys(SHIPMENT_STATUS).map((s) => (
                <option key={s} value={s}>{label(SHIPMENT_STATUS, s)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">发货设备 *</span>
            <input
              className="input"
              value={f.equipmentName}
              onChange={(e) => set("equipmentName", e.target.value)}
              placeholder="选合同后自动带出，可修改"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">数量 *</span>
            <input
              className="input mono"
              type="number"
              min={1}
              value={f.quantity}
              onChange={(e) => {
                setQuantityTouched(true);
                set("quantity", e.target.value);
              }}
            />
            {currentAvailability?.machines != null ? (
              <span className="text-[11px] text-faint">
                合同 {currentAvailability.machines} 台 · 已发 {currentAvailability.shipped} 台 · 待发{" "}
                <span className="text-brandhi">{currentAvailability.remaining}</span> 台
                {!editing ? "（数量已按待发台数带入，可修改）" : ""}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="label">收货地址 *</span>
            <input className="input" value={f.receivingAddress} onChange={(e) => set("receivingAddress", e.target.value)} placeholder="省市区 + 详细地址" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">司机电话 *</span>
            <input className="input mono" value={f.driverPhone} onChange={(e) => set("driverPhone", e.target.value)} placeholder="承运司机联系电话" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">备注</span>
            <input className="input" value={f.remark} onChange={(e) => set("remark", e.target.value)} placeholder="物流单号 / 注意事项" />
          </div>
          <ShipmentFileField
            label="发货单"
            url={f.deliveryNoteUrl}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
            uploading={uploading === "docs"}
            onPick={(file) => void upload(file, "docs")}
          />
          <ShipmentFileField
            label="发货照片"
            url={f.shipmentPhotoUrl}
            accept=".jpg,.jpeg,.png,.webp"
            uploading={uploading === "photos"}
            onPick={(file) => void upload(file, "photos")}
          />
        </div>
        <div className="mt-1 flex items-center justify-end gap-2 border-t border-line/60 pt-3.5">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button type="submit" className="btn-brand" disabled={saving}>
            {saving ? <Spinner className="!h-4 !w-4" /> : editing ? "保存修改" : "登记发货"}
          </button>
        </div>
      </form>
      {overConfirm && currentAvailability?.machines != null && (
        <ConfirmDialog
          title="发货数量超出合同未发数量"
          message={`本次登记 ${overConfirm.quantity} 台，超过该合同的可发数量。\n\n合同 ${currentAvailability.machines} 台 · 已发 ${currentAvailability.shipped} 台 · 待发 ${currentAvailability.remaining} 台。\n\n请核对合同明细与发货记录；确认无误后可继续登记。`}
          confirmText="确认登记"
          cancelText="返回修改"
          busy={saving}
          onCancel={() => setOverConfirm(null)}
          onConfirm={() => {
            const quantity = overConfirm.quantity;
            setOverConfirm(null);
            void runSave(quantity);
          }}
        />
      )}
    </Sheet>
  );
}

/** 发货单 / 发货照片上传控件：文件经主进程 multipart 上传，返回 url 存入表单，保存时随记录提交 */
function ShipmentFileField({
  label,
  url,
  accept,
  uploading,
  onPick,
}: {
  label: string;
  url: string;
  accept: string;
  uploading: boolean;
  onPick: (file: File | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">{label}（非必填，≤20MB）</span>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-dim hover:bg-panel2">
        {uploading ? <Spinner className="!h-3.5 !w-3.5" /> : <Paperclip size={13} />}
        {uploading ? "上传中…" : url ? "已上传，点击更换" : "选择文件"}
        <input
          type="file"
          className="hidden"
          accept={accept}
          disabled={uploading}
          onChange={(event) => {
            onPick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      {url && (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-brandhi hover:underline"
          onClick={() => openShipmentAttachment(url, label)}
        >
          <Eye size={12} />
          预览已上传文件（{attachmentName(url)}）
        </button>
      )}
    </div>
  );
}
