import { useCallback, useEffect, useRef, useState } from "react";
import { Search, RefreshCw, Plus, PenLine, CircleDollarSign, Unlock, Trash2, Paperclip } from "lucide-react";
import { api } from "../lib/api";
import { PAYMENT_STATUS, CONTRACT_STATUS, SHIPMENT_STATUS, PROVINCE_OPTIONS, label, pillTone, money, date } from "../lib/format";
import { Spinner, Empty, ErrorTip, Pill, Sheet, Field, Dash, PageHeader, Segmented, showToast, ConfirmDialog } from "../components/ui";
import { AttachmentLink } from "../components/attachment-preview";
import { ContractFormSheet, PaymentFormSheet } from "../components/crm-forms";
import { attachmentName } from "../lib/attachments";
import type { ContractPaymentRow, ContractRow } from "../types";

const TABS = [
  { value: "all", label: "全部" },
  { value: "unpaid", label: "未回款" },
  { value: "partial", label: "部分回款" },
  { value: "paid", label: "已回款" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

function initialContractTab(filters?: Record<string, string | undefined>): TabValue {
  if (TABS.some((item) => item.value === filters?.tab)) return filters!.tab as TabValue;
  return ({ UNPAID: "unpaid", PARTIAL_PAID: "partial", PAID: "paid" } as Record<string, TabValue>)[filters?.paymentStatus || ""] || "all";
}

export default function ContractsView({ initialFilters, focusId }: { initialFilters?: Record<string, string | undefined>; focusId?: string }) {
  const [search, setSearch] = useState(initialFilters?.search || "");
  const [tab, setTab] = useState<TabValue>(() => initialContractTab(initialFilters));
  // 合同状态 / 省份筛选：与平台 ContractsPage 同名 query 参数（contractStatus、province）
  const [contractStatus, setContractStatus] = useState(initialFilters?.contractStatus || "");
  const [province, setProvince] = useState(initialFilters?.province || "");
  const [rows, setRows] = useState<ContractRow[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  // 深链（工作台发货提醒行 / 任务详情）直接开详情：先放一个只带 id 的壳，
  // ContractDetail 会自己拉完整合同，用户不用先翻列表找人。
  const [active, setActive] = useState<ContractRow | null>(() => (focusId ? ({ id: focusId } as ContractRow) : null));
  const [contractForm, setContractForm] = useState<null | { mode: "create" } | { mode: "edit"; contract: ContractRow }>(null);
  const [paymentFor, setPaymentFor] = useState<{ contract: ContractRow; payment: ContractPaymentRow | null } | null>(null);
  const [unlockRequest, setUnlockRequest] = useState<{ contract: ContractRow; reason: string } | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<{ contract: ContractRow; reason: string } | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const res = await api<ContractRow[]>("/api/contracts", {
        query: {
          search, tab: tab === "all" ? "" : tab,
          salesUserId: initialFilters?.salesUserId, kpiSalesUserId: initialFilters?.kpiSalesUserId,
          region: initialFilters?.region, province, businessLine: initialFilters?.businessLine,
          contractStatus, createdStart: initialFilters?.createdStart,
          createdEnd: initialFilters?.createdEnd, signedStart: initialFilters?.signedStart,
          signedEnd: initialFilters?.signedEnd, overdueShipment: initialFilters?.overdueShipment,
        },
      });
      if (requestId !== loadRequestRef.current) return;
      setRows(res);
    } catch (err) {
      if (requestId === loadRequestRef.current) setError((err as Error).message);
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [search, tab, contractStatus, province, initialFilters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => () => {
    loadRequestRef.current += 1;
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  const onSearchChange = (v: string) => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setSearch(v), 400);
  };

  // 合计与工作台 KPI 同源：工作台「本期回款」= 本期新建合同的 paidAmount 之和，
  // 所以这里必须把已收/未收合计露出来，点进来才能对上数。
  const totals = (rows || []).reduce(
    (acc, c) => ({
      amount: acc.amount + Number(c.amount || 0),
      paid: acc.paid + Number(c.paidAmount || 0),
      unpaid: acc.unpaid + Number(c.unpaidAmount || 0),
    }),
    { amount: 0, paid: 0, unpaid: 0 },
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <PageHeader
          title="合同管理"
          sub={
            rows
              ? `共 ${rows.length} 份 · 合同额 ${money(totals.amount)} · 已收 ${money(totals.paid)} · 未收 ${money(totals.unpaid)}`
              : "加载中…"
          }
        >
          <Segmented options={TABS} value={tab} onChange={setTab} />
          <select className="input !w-auto" value={contractStatus} onChange={(e) => setContractStatus(e.target.value)} aria-label="合同状态筛选">
            <option value="">全部状态</option>
            {Object.keys(CONTRACT_STATUS).map((s) => (
              <option key={s} value={s}>{label(CONTRACT_STATUS, s)}</option>
            ))}
          </select>
          <select className="input !w-auto" value={province} onChange={(e) => setProvince(e.target.value)} aria-label="省份筛选">
            <option value="">全部省份</option>
            {PROVINCE_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className="input !pl-8"
              placeholder="搜索合同号 / 客户 / 设备型号"
              defaultValue={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <button className="btn-brand" onClick={() => setContractForm({ mode: "create" })}>
            <Plus size={15} /> 新建合同
          </button>
          <button className="btn-ghost !px-2.5" title="刷新" onClick={load}>
            {loading ? <Spinner className="!w-4 !h-4" /> : <RefreshCw size={15} />}
          </button>
        </PageHeader>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <div className="panel overflow-hidden max-w-[1400px]">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-panel z-10">
              <tr>
                <th className="th">合同号</th>
                <th className="th">客户</th>
                <th className="th">设备</th>
                <th className="th text-right">合同金额</th>
                <th className="th text-right">已收</th>
                <th className="th text-right">未收</th>
                <th className="th">回款状态</th>
                <th className="th">签订日期</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((c) => (
                <tr key={c.id} className="row-hover" onClick={() => setActive(c)}>
                  <td className="td mono text-xs text-dim">{c.contractNo}</td>
                  <td className="td font-medium">{c.customer?.companyName || "—"}</td>
                  <td className="td text-dim">
                    <div className="max-w-[220px] truncate">{c.equipmentName || c.equipmentModel || "—"}</div>
                  </td>
                  <td className="td mono text-right">{money(c.amount, c.currency)}</td>
                  <td className="td mono text-right text-ok">{money(c.paidAmount, c.currency)}</td>
                  <td className="td mono text-right text-warn">
                    {c.unpaidAmount != null ? money(c.unpaidAmount, c.currency) : "—"}
                  </td>
                  <td className="td">
                    <Pill tone={pillTone(PAYMENT_STATUS, c.paymentStatus)}>{label(PAYMENT_STATUS, c.paymentStatus)}</Pill>
                  </td>
                  <td className="td mono text-xs text-dim">{date(c.signedDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && !rows && (
            <div className="py-16 flex justify-center">
              <Spinner />
            </div>
          )}
          {!loading && error && <ErrorTip message={error} onRetry={load} />}
          {!loading && !error && rows && rows.length === 0 && <Empty text="没有符合条件的合同" />}
        </div>
      </div>

      {active && (
        <ContractDetail
          brief={active}
          onClose={() => setActive(null)}
          onEdit={(c) => setContractForm({ mode: "edit", contract: c })}
          onPayment={(c) => setPaymentFor({ contract: c, payment: null })}
          onEditPayment={(c, payment) => setPaymentFor({ contract: c, payment })}
          onRequestUnlock={(c) => setUnlockRequest({ contract: c, reason: "" })}
          onRequestDelete={(c) => setDeleteRequest({ contract: c, reason: "" })}
        />
      )}

      {contractForm && (
        <ContractFormSheet
          contract={contractForm.mode === "edit" ? contractForm.contract : null}
          onClose={() => setContractForm(null)}
          onSaved={() => {
            setContractForm(null);
            setActive(null);
            load();
          }}
        />
      )}
      {paymentFor && (
        <PaymentFormSheet
          contract={paymentFor.contract}
          payment={paymentFor.payment}
          onClose={() => setPaymentFor(null)}
          onSaved={() => {
            setPaymentFor(null);
            setActive(null);
            load();
          }}
        />
      )}

      {/* 申请解锁弹窗 */}
      {unlockRequest && (
        <Sheet title="申请解锁合同" subtitle={unlockRequest.contract.contractNo} onClose={() => setUnlockRequest(null)}>
          <div className="space-y-4">
            <p className="text-sm text-dim">请说明申请解锁的原因</p>
            <textarea
              value={unlockRequest.reason}
              onChange={(e) => setUnlockRequest({ ...unlockRequest, reason: e.target.value })}
              placeholder="例如：客户要求修改产品配置"
              rows={4}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  if (!unlockRequest.reason.trim()) {
                    showToast("请填写解锁原因", "error");
                    return;
                  }
                  try {
                    await api("/api/contract-unlock-requests", {
                      method: "POST",
                      body: { contractId: unlockRequest.contract.id, reason: unlockRequest.reason },
                    });
                    showToast("解锁申请已提交，等待管理员审批", "success");
                    setUnlockRequest(null);
                  } catch (error) {
                    showToast(error instanceof Error ? error.message : "提交失败", "error");
                  }
                }}
                className="btn-brand"
              >
                提交申请
              </button>
              <button onClick={() => setUnlockRequest(null)} className="btn-ghost">
                取消
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {/* 申请删除弹窗 */}
      {deleteRequest && (
        <Sheet title="申请删除合同" subtitle={deleteRequest.contract.contractNo} onClose={() => setDeleteRequest(null)}>
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                ⚠️ 删除后合同将被标记为已删除，数据保留可恢复
              </p>
            </div>
            <p className="text-sm text-dim">请说明申请删除的原因</p>
            <textarea
              value={deleteRequest.reason}
              onChange={(e) => setDeleteRequest({ ...deleteRequest, reason: e.target.value })}
              placeholder="例如：客户取消订单，合同作废"
              rows={4}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  if (!deleteRequest.reason.trim()) {
                    showToast("请填写删除原因", "error");
                    return;
                  }
                  try {
                    await api("/api/contract-delete-requests", {
                      method: "POST",
                      body: { contractId: deleteRequest.contract.id, reason: deleteRequest.reason },
                    });
                    showToast("删除申请已提交，等待管理员审批", "success");
                    setDeleteRequest(null);
                  } catch (error) {
                    showToast(error instanceof Error ? error.message : "提交失败", "error");
                  }
                }}
                className="rounded-xl bg-bad px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bad/90"
              >
                提交申请
              </button>
              <button onClick={() => setDeleteRequest(null)} className="btn-ghost">
                取消
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function ContractDetail({
  brief,
  onClose,
  onEdit,
  onPayment,
  onEditPayment,
  onRequestUnlock,
  onRequestDelete,
}: {
  brief: ContractRow;
  onClose: () => void;
  onEdit: (c: ContractRow) => void;
  onPayment: (c: ContractRow) => void;
  onEditPayment: (c: ContractRow, payment: ContractPaymentRow) => void;
  onRequestUnlock: (c: ContractRow) => void;
  onRequestDelete: (c: ContractRow) => void;
}) {
  const [detail, setDetail] = useState<ContractRow | null>(null);
  const [err, setErr] = useState("");

  const loadDetail = useCallback(async () => {
    setErr("");
    try {
      const res = await api<any>(`/api/contracts/${brief.id}`);
      // 兼容直接返回合同对象或 { contract } 包装
      const next: ContractRow = res?.id && res?.contractNo ? res : res?.contract;
      setDetail(next || brief);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [brief.id]);

  useEffect(() => {
    setDetail(null);
    void loadDetail();
  }, [loadDetail]);

  const c = detail || brief;
  const amount = Number(c.amount || 0);
  const paid = Number(c.paidAmount || 0);
  const pct = amount > 0 ? Math.min(100, Math.round((paid / amount) * 100)) : 0;
  // 作废回款保留展示（灰显），与网页端一致，不再静默过滤
  const payments = c.payments || [];
  const items = c.items || [];
  const shipments = c.shipments || [];
  // 平台按 isLocked/canEdit 决定入口：锁定态才引导申请解锁，未锁定时申请会被 400 拒绝
  const locked = c.isLocked === true;
  const canEdit = detail ? c.canEdit !== false : false;

  return (
    <Sheet
      title={c.contractNo || "合同详情"}
      subtitle={`${c.customer?.companyName || ""} · ${c.equipmentName || c.equipmentModel || ""}`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {locked && <span className="text-xs text-warn mr-auto">该合同已锁定，编辑需先申请解锁</span>}
          <button className="btn-ghost" disabled={!detail || !canEdit} onClick={() => onEdit(c)} title={!detail ? "详情加载中" : locked ? "合同已锁定，请先申请解锁" : undefined}>
            <PenLine size={13} /> 编辑
          </button>
          {locked && (
            <button className="btn-ghost" disabled={!detail} onClick={() => onRequestUnlock(c)} title={detail ? undefined : "详情加载中"}>
              <Unlock size={13} /> 申请解锁
            </button>
          )}
          <button className="btn-ghost text-bad" disabled={!detail} onClick={() => onRequestDelete(c)} title={detail ? undefined : "详情加载中"}>
            <Trash2 size={13} /> 申请删除
          </button>
          <button className="btn-brand" disabled={!detail || !canEdit} onClick={() => onPayment(c)} title={!detail ? "详情加载中" : locked ? "合同已锁定，请先申请解锁" : undefined}>
            <CircleDollarSign size={13} /> 登记回款
          </button>
        </div>

        {c.attachmentUrl && (
          <div className="flex items-center gap-2 text-xs text-faint">
            合同附件：
            <AttachmentLink
              path={c.attachmentUrl}
              label={`${c.contractNo} 合同附件`}
              className="inline-flex max-w-full items-center gap-1.5 text-brandhi hover:underline"
            >
              <Paperclip size={12} />
              <span className="truncate">{attachmentName(c.attachmentUrl)}</span>
            </AttachmentLink>
          </div>
        )}

        {/* 收款进度（账单风格） */}
        <div className="panel panel-glow px-4 py-4 flex flex-col gap-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="label">合同金额</div>
              <div className="mono text-2xl font-semibold text-brandhi mt-0.5">{money(c.amount, c.currency)}</div>
            </div>
            <div className="text-right text-xs text-faint">
              <div>
                已收 <span className="mono text-ok">{money(c.paidAmount, c.currency)}</span>
              </div>
              <div className="mt-0.5">
                未收{" "}
                <span className="mono text-warn">
                  {c.unpaidAmount != null ? money(c.unpaidAmount, c.currency) : money(Number(amount) - Number(paid), c.currency)}
                </span>
              </div>
            </div>
          </div>
          <div>
            <div className="h-2 rounded-full bg-steel/25 overflow-hidden">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between mt-1.5 text-[11px] text-faint">
              <span>
                <Pill tone={pillTone(PAYMENT_STATUS, c.paymentStatus)}>{label(PAYMENT_STATUS, c.paymentStatus)}</Pill>
              </span>
              <span className="mono">{pct}%</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <Field label="客户">{c.customer?.companyName || <Dash />}</Field>
          <Field label="联系人">{c.customer?.contactName || <Dash />}</Field>
          <Field label="销售负责人">{c.salesUser?.name || <Dash />}</Field>
          <Field label="签订日期">{date(c.signedDate)}</Field>
          <Field label="预计发货">{c.estimatedShipmentDate ? date(c.estimatedShipmentDate) : <Dash />}</Field>
          <Field label="合同状态">
            <Pill tone={pillTone(CONTRACT_STATUS, c.contractStatus)}>{label(CONTRACT_STATUS, c.contractStatus)}</Pill>
          </Field>
        </div>

        {c.equipmentModel && (
          <Field label="设备型号">
            <span className="mono">{c.equipmentModel}</span>
          </Field>
        )}
        {c.remark && (
          <Field label="备注">
            <span className="text-dim">{c.remark}</span>
          </Field>
        )}

        {shipments.length > 0 && (
          <div>
            <div className="label mb-2">发货记录</div>
            <div className="flex flex-wrap gap-1.5">
              {shipments.map((s) => (
                <Pill key={s.id} tone={pillTone(SHIPMENT_STATUS, s.shipmentStatus)}>
                  {label(SHIPMENT_STATUS, s.shipmentStatus)}
                  {s.shipmentDate ? ` · ${date(s.shipmentDate)}` : ""}
                </Pill>
              ))}
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div>
            <div className="label mb-2">设备明细（{items.length}）</div>
            <div className="panel divide-y divide-line/50">
              {items.map((it) => (
                <div key={it.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{it.productNameSnapshot}</div>
                    <div className="text-xs text-faint mono mt-0.5">{it.productModelSnapshot}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="mono text-sm">× {it.quantity}</div>
                    {it.contractPrice != null && (
                      <div className="mono text-xs text-dim mt-0.5">{money(it.contractPrice, c.currency)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="label mb-2">回款记录（{payments.length}）</div>
          {err && <div className="text-xs text-bad mb-2">详情加载失败：{err}</div>}
          {payments.length === 0 ? (
            <div className="text-xs text-faint py-1">暂无回款记录</div>
          ) : (
            <div className="panel divide-y divide-line/50">
              {payments.map((p) => (
                <div key={p.id} className={`px-3.5 py-2.5 flex items-center justify-between gap-3 ${p.status === "VOIDED" ? "opacity-50" : ""}`}>
                  <div>
                    <div className={`mono text-sm ${p.status === "VOIDED" ? "text-faint line-through" : "text-ok"}`}>{money(p.amount, c.currency)}</div>
                    <div className="text-xs text-faint mt-0.5">
                      {date(p.paymentDate)}
                      {p.paymentMethod ? ` · ${p.paymentMethod}` : ""}
                      {p.status === "VOIDED" ? " · 已作废" : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    {p.remark && <div className="text-xs text-faint truncate max-w-[200px]">{p.remark}</div>}
                    {p.status !== "VOIDED" && c.canEdit !== false && (
                      <>
                        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => onEditPayment(c, p)}>
                          编辑
                        </button>
                        <button
                          className="btn-ghost !px-2 !py-1 text-xs text-bad"
                          onClick={async () => {
                            if (!window.confirm(`作废这笔 ${money(p.amount, c.currency)} 的回款？作废后合同已收金额会重算。`)) return;
                            try {
                              await api(`/api/contracts/${c.id}/payments/${p.id}`, { method: "DELETE" });
                              showToast("回款已作废", "success");
                              await loadDetail();
                            } catch (error) {
                              showToast((error as Error).message, "error");
                            }
                          }}
                        >
                          作废
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
