import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { buildAfterSalesCreatePayload, buildAfterSalesUpdatePayload } from "../lib/after-sales";
import { AFTER_SALES_TYPE, URGENCY, AFTER_SALES_STATUS, PROBLEM_CATEGORY, SATISFACTION, label } from "../lib/format";
import { Sheet, Spinner, notify } from "./ui";
import { AfterSalesPartsPicker } from "./after-sales-parts";
import type { AfterSalesRow } from "../types";

function today(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 新建售后工单：选合同（服务端搜索）+ 类型/紧急度/派发日期/服务地址/说明等必填项 */
export function AfterSalesCreateSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [contractId, setContractId] = useState("");
  const [contractSearch, setContractSearch] = useState("");
  const [contractOptions, setContractOptions] = useState<{ id: string; contractNo: string; customer: { companyName: string } | null; equipmentName: string }[]>([]);
  const [contractLoading, setContractLoading] = useState(false);
  const [partNames, setPartNames] = useState<string[]>([]);
  const contractRequestRef = useRef(0);
  const contractDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [f, setF] = useState({
    orderType: "NEW_MACHINE_DEBUG",
    urgency: "NORMAL",
    dispatchDate: today(),
    serviceAmount: "",
    assigneeNames: "",
    serviceAddress: "",
    description: "",
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  const searchContracts = (q: string) => {
    setContractSearch(q);
    setContractId("");
    setPartNames([]);
    if (contractDebounceRef.current) clearTimeout(contractDebounceRef.current);
    const requestId = ++contractRequestRef.current;
    setContractLoading(true);
    contractDebounceRef.current = setTimeout(async () => {
      try {
        const res = await api<{ items: typeof contractOptions }>("/api/after-sales/contracts", { query: { q: q.trim() || undefined } });
        if (requestId === contractRequestRef.current) setContractOptions(res.items || []);
      } catch {
        if (requestId === contractRequestRef.current) setContractOptions([]);
      } finally {
        if (requestId === contractRequestRef.current) setContractLoading(false);
      }
    }, q.trim() ? 250 : 0);
  };

  useEffect(() => () => {
    contractRequestRef.current += 1;
    if (contractDebounceRef.current) clearTimeout(contractDebounceRef.current);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setErr("");
    setSaving(true);
    try {
      const body = buildAfterSalesCreatePayload({
        contractId,
        orderType: f.orderType,
        urgency: f.urgency,
        dispatchDate: f.dispatchDate,
        serviceAmount: f.serviceAmount,
        assigneeNames: f.assigneeNames,
        serviceAddress: f.serviceAddress,
        description: f.description,
        partNames,
      });
      await api("/api/after-sales", { method: "POST", body });
      notify("售后工单已创建");
      onSaved();
      onClose();
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title="新建售后工单" subtitle="派发后可通过状态流转推进工单，完成后提交回执" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {err && <div className="rounded-lg border border-bad/25 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="label">关联合同 *</span>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="输入合同号 / 客户 / 设备搜索"
                value={contractSearch}
                onChange={(e) => searchContracts(e.target.value)}
              />
              {contractLoading && <Spinner className="!w-4 !h-4 my-auto" />}
            </div>
            {contractOptions.length > 0 && (
              <div className="panel max-h-40 overflow-y-auto">
                {contractOptions.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => {
                      contractRequestRef.current += 1;
                      if (contractDebounceRef.current) clearTimeout(contractDebounceRef.current);
                      setContractId(c.id);
                      setContractSearch(`${c.contractNo} · ${c.customer?.companyName || "—"}`);
                      setContractOptions([]);
                      setContractLoading(false);
                    }}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-panel2 ${contractId === c.id ? "text-brandhi" : ""}`}
                  >
                    <span className="mono text-xs">{c.contractNo}</span>
                    <span className="ml-2">{c.customer?.companyName || "—"}</span>
                    {c.equipmentName && <span className="ml-1.5 text-xs text-faint">· {c.equipmentName}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">工单类型 *</span>
            <select className="input" value={f.orderType} onChange={(e) => {
              const orderType = e.target.value;
              setF((prev) => ({ ...prev, orderType, ...(orderType === "OUT_WARRANTY_PAID" ? {} : { serviceAmount: "" }) }));
            }}>
              {Object.keys(AFTER_SALES_TYPE).map((t) => (
                <option key={t} value={t}>{label(AFTER_SALES_TYPE, t)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">紧急程度 *</span>
            <select className="input" value={f.urgency} onChange={(e) => set("urgency", e.target.value as any)}>
              {Object.keys(URGENCY).map((u) => (
                <option key={u} value={u}>{label(URGENCY, u)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">派发日期 *</span>
            <input className="input" type="date" value={f.dispatchDate} onChange={(e) => set("dispatchDate", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">服务费用（元）{f.orderType === "OUT_WARRANTY_PAID" ? " *" : ""}</span>
            <input className="input mono" type="number" min={0} step="0.01" disabled={f.orderType !== "OUT_WARRANTY_PAID"} value={f.serviceAmount} onChange={(e) => set("serviceAmount", e.target.value)} placeholder={f.orderType === "OUT_WARRANTY_PAID" ? "请输入金额" : "仅质保外有偿服务填写"} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">售后人员 *</span>
            <input className="input" value={f.assigneeNames} onChange={(e) => set("assigneeNames", e.target.value)} placeholder="姓名，多人空格分隔" />
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="label">更换配件</span>
            <AfterSalesPartsPicker contractId={contractId} value={partNames} onChange={setPartNames} />
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="label">服务地址</span>
            <input className="input" maxLength={255} value={f.serviceAddress} onChange={(e) => set("serviceAddress", e.target.value)} placeholder="选填，默认可留空" />
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="label">工单说明 *</span>
            <textarea className="input !h-20 resize-none" value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="问题描述 / 服务要求" />
          </div>
        </div>
        <div className="mt-1 flex items-center justify-end gap-2 border-t border-line/60 pt-3.5">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button type="submit" className="btn-brand" disabled={saving}>
            {saving ? <Spinner className="!h-4 !w-4" /> : "创建工单"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** 编辑工单：仅待派发/已派发可编辑，PUT /api/after-sales/{id}，可编辑字段与平台一致 */
export function AfterSalesEditSheet({ order, onClose, onSaved }: { order: AfterSalesRow; onClose: () => void; onSaved: () => void }) {
  const [partNames, setPartNames] = useState<string[]>(() => order.parts?.map((part) => part.partName) || []);
  const [f, setF] = useState({
    orderType: order.orderType,
    urgency: order.urgency,
    dispatchDate: order.dispatchDate ? String(order.dispatchDate).slice(0, 10) : today(),
    serviceAmount: order.serviceAmount != null ? String(order.serviceAmount) : "",
    assigneeNames: order.assigneeNames || "",
    serviceAddress: order.serviceAddress || "",
    description: order.description || "",
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setErr("");
    setSaving(true);
    try {
      const body = buildAfterSalesUpdatePayload({
        orderType: f.orderType,
        urgency: f.urgency,
        dispatchDate: f.dispatchDate,
        serviceAmount: f.serviceAmount,
        assigneeNames: f.assigneeNames,
        serviceAddress: f.serviceAddress,
        description: f.description,
        partNames,
      });
      await api(`/api/after-sales/${order.id}`, { method: "PUT", body });
      notify("工单已更新");
      onSaved();
      onClose();
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title="编辑工单" subtitle={`${order.orderNo} · 仅待派发 / 已派发可编辑`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {err && <div className="rounded-lg border border-bad/25 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <div className="flex flex-col gap-1.5">
            <span className="label">工单类型 *</span>
            <select className="input" value={f.orderType} onChange={(e) => {
              const orderType = e.target.value;
              setF((prev) => ({ ...prev, orderType, ...(orderType === "OUT_WARRANTY_PAID" ? {} : { serviceAmount: "" }) }));
            }}>
              {Object.keys(AFTER_SALES_TYPE).map((t) => (
                <option key={t} value={t}>{label(AFTER_SALES_TYPE, t)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">紧急程度 *</span>
            <select className="input" value={f.urgency} onChange={(e) => set("urgency", e.target.value)}>
              {Object.keys(URGENCY).map((u) => (
                <option key={u} value={u}>{label(URGENCY, u)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">派发日期 *</span>
            <input className="input" type="date" value={f.dispatchDate} onChange={(e) => set("dispatchDate", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">服务费用（元）{f.orderType === "OUT_WARRANTY_PAID" ? " *" : ""}</span>
            <input className="input mono" type="number" min={0} step="0.01" disabled={f.orderType !== "OUT_WARRANTY_PAID"} value={f.serviceAmount} onChange={(e) => set("serviceAmount", e.target.value)} placeholder={f.orderType === "OUT_WARRANTY_PAID" ? "请输入金额" : "仅质保外有偿服务填写"} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">售后人员 *</span>
            <input className="input" value={f.assigneeNames} onChange={(e) => set("assigneeNames", e.target.value)} placeholder="姓名，多人空格分隔" />
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="label">服务地址</span>
            <input className="input" maxLength={255} value={f.serviceAddress} onChange={(e) => set("serviceAddress", e.target.value)} placeholder="选填，默认可留空" />
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="label">涉及配件</span>
            <AfterSalesPartsPicker contractId={order.contractId} value={partNames} onChange={setPartNames} />
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="label">工单说明 *</span>
            <textarea className="input !h-24 resize-none" value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="问题描述 / 服务要求" />
          </div>
        </div>
        <div className="mt-1 flex items-center justify-end gap-2 border-t border-line/60 pt-3.5">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button type="submit" className="btn-brand" disabled={saving}>
            {saving ? <Spinner className="!h-4 !w-4" /> : "保存修改"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** 状态流转弹层：仅展示当前允许的下一状态，服务端校验流转规则 */
export function AfterSalesStatusSheet({ order, onClose, onSaved }: { order: AfterSalesRow; onClose: () => void; onSaved: () => void }) {
  const nextStatuses = {
    PENDING_DISPATCH: ["DISPATCHED"],
    DISPATCHED: ["IN_PROGRESS"],
    IN_PROGRESS: [], // 处理中需通过回执完成
    COMPLETED: [], // CLOSED 在详情内上传签字附件后操作
    CLOSED: [],
  }[order.status] || [];

  const [next, setNext] = useState(nextStatuses[0] || "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !next) return;
    setErr("");
    setSaving(true);
    try {
      await api(`/api/after-sales/${order.id}/status`, { method: "POST", body: { status: next } });
      notify(`工单已更新为【${label(AFTER_SALES_STATUS, next)}】`);
      onSaved();
      onClose();
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (nextStatuses.length === 0) {
    return (
      <Sheet title="状态流转" onClose={onClose}>
        <div className="panel px-4 py-3 text-sm text-faint">
          当前状态【{label(AFTER_SALES_STATUS, order.status)}】无可用流转操作。
          {order.status === "IN_PROGRESS" && <p className="mt-2 text-xs">处理中的工单请通过【提交回执】完成。</p>}
          {order.status === "COMPLETED" && <p className="mt-2 text-xs">请在工单详情上传客户签字附件后关闭。</p>}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="状态流转" subtitle={`将工单从【${label(AFTER_SALES_STATUS, order.status)}】推进到下一状态`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {err && <div className="rounded-lg border border-bad/25 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
        <div className="flex flex-col gap-1.5">
          <span className="label">下一状态</span>
          <select className="input" value={next} onChange={(e) => setNext(e.target.value)}>
            {nextStatuses.map((s) => (
              <option key={s} value={s}>{label(AFTER_SALES_STATUS, s)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line/60 pt-3.5">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button type="submit" className="btn-brand" disabled={saving}>
            {saving ? <Spinner className="!h-4 !w-4" /> : "确认流转"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** 服务回执：处理中工单完成后提交回执（完成日期、回执内容、问题分类、满意度可为空），提交后自动流转到 COMPLETED */
export function AfterSalesReceiptSheet({ order, onClose, onSaved }: { order: AfterSalesRow; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    completedDate: today(),
    receiptContent: "",
    problemCategory: "OPERATION",
    otherReason: "",
    satisfaction: "",
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [partNames, setPartNames] = useState<string[]>(() => order.parts?.map((part) => part.partName) || []);
  const set = (k: keyof typeof f, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setErr("");
    if (!f.completedDate || !f.receiptContent.trim()) {
      setErr("完成日期、回执内容为必填项");
      return;
    }
    if (f.problemCategory === "OTHER" && !f.otherReason.trim()) {
      setErr("选择其他原因时需填写具体原因");
      return;
    }
    setSaving(true);
    try {
      const body = {
        completedDate: f.completedDate,
        receiptContent: f.receiptContent.trim(),
        problemCategory: f.problemCategory,
        otherReason: f.problemCategory === "OTHER" ? f.otherReason.trim() : null,
        // 平台允许满意度为空（null），不强制三选一
        satisfaction: f.satisfaction || null,
        partNames,
      };
      await api(`/api/after-sales/${order.id}/receipt`, { method: "POST", body });
      notify("服务回执已提交，工单已自动标记为【已完成】");
      onSaved();
      onClose();
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title="提交服务回执" subtitle="仅处理中工单可提交回执，提交后自动流转到【已完成】" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {err && <div className="rounded-lg border border-bad/25 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <div className="flex flex-col gap-1.5">
            <span className="label">完成日期 *</span>
            <input className="input" type="date" value={f.completedDate} onChange={(e) => set("completedDate", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">客户满意度</span>
            <select className="input" value={f.satisfaction} onChange={(e) => set("satisfaction", e.target.value)}>
              <option value="">未评价</option>
              {Object.keys(SATISFACTION).map((s) => (
                <option key={s} value={s}>{label(SATISFACTION, s)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="label">问题原因分类 *</span>
            <select className="input" value={f.problemCategory} onChange={(e) => set("problemCategory", e.target.value)}>
              {Object.keys(PROBLEM_CATEGORY).map((c) => (
                <option key={c} value={c}>{label(PROBLEM_CATEGORY, c)}</option>
              ))}
            </select>
          </div>
          {f.problemCategory === "OTHER" && (
            <div className="flex flex-col gap-1.5 col-span-2">
              <span className="label">具体原因 *</span>
              <input className="input" value={f.otherReason} onChange={(e) => set("otherReason", e.target.value)} placeholder="详细说明问题原因" />
            </div>
          )}
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="label">回执内容 *</span>
            <textarea className="input !h-24 resize-none" value={f.receiptContent} onChange={(e) => set("receiptContent", e.target.value)} placeholder="处理过程、更换配件、最终结果等" />
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="label">涉及配件</span>
            <AfterSalesPartsPicker contractId={order.contractId} value={partNames} onChange={setPartNames} />
          </div>
        </div>
        <div className="mt-1 flex items-center justify-end gap-2 border-t border-line/60 pt-3.5">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button type="submit" className="btn-brand" disabled={saving}>
            {saving ? <Spinner className="!h-4 !w-4" /> : "提交回执"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
