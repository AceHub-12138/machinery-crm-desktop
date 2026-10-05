import { useCallback, useEffect, useRef, useState } from "react";
import { Search, RefreshCw, ChevronLeft, ChevronRight, Phone, Plus, ArrowRight, FileText, Pencil } from "lucide-react";
import { api } from "../lib/api";
import {
  canCloseAfterSalesOrder,
  canEditAfterSalesOrder,
  afterSalesAlertLabel,
  afterSalesAlertTone,
} from "../lib/after-sales";
import {
  AFTER_SALES_STATUS,
  AFTER_SALES_TYPE,
  URGENCY,
  PROBLEM_CATEGORY,
  SATISFACTION,
  label,
  pillTone,
  money,
  date,
} from "../lib/format";
import { Spinner, Empty, ErrorTip, Pill, PageHeader, Sheet, Field, Dash } from "../components/ui";
import { AfterSalesCreateSheet, AfterSalesStatusSheet, AfterSalesReceiptSheet, AfterSalesEditSheet } from "../components/aftersales-forms";
import { AfterSalesAttachments } from "../components/erp-attachments";
import type { AfterSalesRow } from "../types";

const STATUS_OPTIONS = ["PENDING_DISPATCH", "DISPATCHED", "IN_PROGRESS", "COMPLETED", "CLOSED"];
type AfterSalesPrintInfo = { companyName: string; contactAddress: string; footerNote: string };
/** 平台 GET /api/after-sales/stats 的汇总部分 */
interface AfterSalesStats {
  summary?: { weekNew?: number; inProgress?: number; overdue?: number };
}

export default function AfterSalesView({ initialFilters, focusId }: { initialFilters?: Record<string, string | undefined>; focusId?: string }) {
  const [search, setSearch] = useState(initialFilters?.keyword || "");
  const [status, setStatus] = useState(initialFilters?.status || "");
  const [orderType, setOrderType] = useState(initialFilters?.orderType || "");
  const [urgency, setUrgency] = useState(initialFilters?.urgency || "");
  const [dateFrom, setDateFrom] = useState(initialFilters?.dateFrom || "");
  const [dateTo, setDateTo] = useState(initialFilters?.dateTo || "");
  const [reminder, setReminder] = useState(initialFilters?.reminder || "");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AfterSalesRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<AfterSalesRow | null>(null);
  const [attachmentCount, setAttachmentCount] = useState(0);
  const [printInfo, setPrintInfo] = useState<AfterSalesPrintInfo | null>(null);
  const [printing, setPrinting] = useState(false);
  const [stats, setStats] = useState<AfterSalesStats | null>(null);
  const [form, setForm] = useState<null | { mode: "create" } | { mode: "status"; order: AfterSalesRow } | { mode: "receipt"; order: AfterSalesRow } | { mode: "edit"; order: AfterSalesRow }>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const [res, statsRes] = await Promise.all([
        api<{ items: AfterSalesRow[]; total: number; page: number; pageSize: number }>(
          "/api/after-sales",
          {
            query: {
              page: String(page),
              pageSize: "30",
              status: status || undefined,
              orderType: orderType || undefined,
              urgency: urgency || undefined,
              dateFrom: dateFrom || undefined,
              dateTo: dateTo || undefined,
              keyword: search,
              reminder: reminder || undefined,
              equipmentModel: initialFilters?.equipmentModel,
              assigneeName: initialFilters?.assigneeName,
            },
          },
        ),
        // 统计接口失败不应影响列表展示
        api<AfterSalesStats>("/api/after-sales/stats").catch(() => null),
      ]);
      if (requestId !== loadRequestRef.current) return;
      setRows(res.items);
      setTotal(res.total);
      setTotalPages(Math.max(1, Math.ceil(res.total / res.pageSize)));
      if (statsRes) setStats(statsRes);
    } catch (err) {
      if (requestId === loadRequestRef.current) setError((err as Error).message);
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [page, search, status, orderType, urgency, dateFrom, dateTo, reminder, initialFilters]);

  useEffect(() => {
    load();
  }, [load]);

  // 深链（工作台售后提醒行）：详情弹层直接读整条工单，列表行里可能没有这条（被筛选掉了），
  // 所以单独按 id 拉一次，拿到后再开弹层。
  useEffect(() => {
    if (!focusId) return;
    let alive = true;
    api<AfterSalesRow>(`/api/after-sales/${focusId}`)
      .then((order) => {
        if (!alive || !order?.id) return;
        setAttachmentCount(0);
        setActive(order);
      })
      .catch((err) => {
        if (alive) setError((err as Error).message);
      });
    return () => {
      alive = false;
    };
  }, [focusId]);

  const onSearchChange = (v: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setReminder("");
      setSearch(v);
    }, 400);
  };

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    loadRequestRef.current += 1;
  }, []);

  const printOrder = async () => {
    setPrinting(true);
    try {
      const info = await api<AfterSalesPrintInfo>("/api/after-sales/print-info");
      setPrintInfo(info);
      window.setTimeout(() => window.print(), 0);
    } catch (printError) {
      setError((printError as Error).message);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <PageHeader title="售后服务" sub={`共 ${total} 个工单 · 按紧急度和派发时间排序`}>
          <button className="btn-brand" onClick={() => setForm({ mode: "create" })}>
            <Plus size={16} />
            新建工单
          </button>
          <button className="btn-ghost !px-2.5" title="刷新" onClick={load}>
            {loading ? <Spinner className="!w-4 !h-4" /> : <RefreshCw size={15} />}
          </button>
        </PageHeader>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className="input !pl-9"
              placeholder="搜索工单号 / 客户 / 机型"
              defaultValue={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <select className="input !w-auto min-w-[100px]" value={status} onChange={(e) => { setPage(1); setReminder(""); setStatus(e.target.value); }}>
            <option value="">全部状态</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{label(AFTER_SALES_STATUS, s)}</option>
            ))}
          </select>
          <select className="input !w-auto min-w-[100px]" value={orderType} onChange={(e) => { setPage(1); setReminder(""); setOrderType(e.target.value); }}>
            <option value="">全部类型</option>
            {Object.keys(AFTER_SALES_TYPE).map((t) => (
              <option key={t} value={t}>{label(AFTER_SALES_TYPE, t)}</option>
            ))}
          </select>
          <select className="input !w-auto" value={urgency} onChange={(e) => { setPage(1); setReminder(""); setUrgency(e.target.value); }}>
            <option value="">全部紧急度</option>
            {Object.keys(URGENCY).map((u) => (
              <option key={u} value={u}>{label(URGENCY, u)}</option>
            ))}
          </select>
          <input className="input !w-36" type="date" value={dateFrom} onChange={(e) => { setPage(1); setReminder(""); setDateFrom(e.target.value); }} placeholder="派发起始" />
          <input className="input !w-36" type="date" value={dateTo} onChange={(e) => { setPage(1); setReminder(""); setDateTo(e.target.value); }} placeholder="派发截止" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <div className="grid grid-cols-3 gap-3 mb-3">
          <SummaryCard label="本周新增" value={stats?.summary?.weekNew} tone="text-brandhi" />
          <SummaryCard label="进行中" value={stats?.summary?.inProgress} tone="text-warn" />
          <SummaryCard label="超时未回执" value={stats?.summary?.overdue} tone="text-bad" />
        </div>
        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: "1000px" }}>
            <thead className="sticky top-0 bg-panel z-10">
              <tr>
                <th className="th">工单号</th>
                <th className="th">客户</th>
                <th className="th">机型</th>
                <th className="th">类型</th>
                <th className="th">紧急度</th>
                <th className="th">状态</th>
                <th className="th">派发日期</th>
                <th className="th w-32">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((o, i) => (
                <tr
                  key={o.id}
                  className="row-hover fade-up"
                  style={{ animationDelay: `${Math.min(i * 25, 400)}ms` }}
                  onClick={() => { setAttachmentCount(0); setActive(o); }}
                >
                  <td className="td mono text-xs text-dim">{o.orderNo}</td>
                  <td className="td font-medium">{o.customerNameSnapshot}</td>
                  <td className="td mono text-xs text-dim">{o.equipmentModelSnapshot || <Dash />}</td>
                  <td className="td text-dim">{label(AFTER_SALES_TYPE, o.orderType)}</td>
                  <td className="td">
                    {o.urgency === "URGENT" ? (
                      <Pill tone={pillTone(URGENCY, o.urgency)}>{label(URGENCY, o.urgency)}</Pill>
                    ) : (
                      <span className="text-faint text-xs">普通</span>
                    )}
                  </td>
                  <td className="td">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Pill tone={pillTone(AFTER_SALES_STATUS, o.status)}>{label(AFTER_SALES_STATUS, o.status)}</Pill>
                      {afterSalesAlertLabel(o.alertState) && (
                        <Pill tone={afterSalesAlertTone(o.alertState)}>{afterSalesAlertLabel(o.alertState)}</Pill>
                      )}
                    </div>
                  </td>
                  <td className="td mono text-xs text-dim">{date(o.dispatchDate)}</td>
                  <td className="td">
                    <div className="flex items-center gap-1.5">
                      {o.status === "IN_PROGRESS" && (
                        <button
                          className="btn-ghost !px-2 !py-1 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setForm({ mode: "receipt", order: o });
                          }}
                          title="提交服务回执"
                        >
                          <FileText size={13} />
                          回执
                        </button>
                      )}
                      {["PENDING_DISPATCH", "DISPATCHED", "IN_PROGRESS"].includes(o.status) && (
                        <button
                          className="btn-ghost !px-2 !py-1 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setForm({ mode: "status", order: o });
                          }}
                          title="状态流转"
                        >
                          <ArrowRight size={13} />
                          流转
                        </button>
                      )}
                    </div>
                  </td>
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
          {!loading && !error && rows && rows.length === 0 && <Empty text="没有符合条件的售后工单" />}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4 text-sm text-dim">
            <button className="btn-ghost !px-2" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={15} />
            </button>
            <span className="mono text-xs">
              第 {page} / {totalPages} 页
            </span>
            <button className="btn-ghost !px-2" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>

      {active && (
        <Sheet
          title={active.orderNo}
          subtitle={`${active.customerNameSnapshot} · ${active.equipmentModelSnapshot || ""}`}
          onClose={() => setActive(null)}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button className="btn-ghost !py-1.5 text-xs" disabled={printing} onClick={() => void printOrder()}>{printing ? "载入打印信息…" : "打印工单"}</button>
              {canEditAfterSalesOrder(active.status) && (
                <button
                  className="btn-ghost !py-1.5 text-xs"
                  title="编辑工单"
                  onClick={() => { setForm({ mode: "edit", order: active }); setActive(null); }}
                >
                  <Pencil size={13} />
                  编辑工单
                </button>
              )}
              {active.status === "COMPLETED" && <button className="btn-brand !py-1.5 text-xs" disabled={!canCloseAfterSalesOrder(active.status, attachmentCount)} title={attachmentCount ? "关闭工单" : "请先上传客户签字附件"} onClick={async () => { try { await api(`/api/after-sales/${active.id}/status`, { method: "POST", body: { status: "CLOSED" } }); setActive(null); await load(); } catch (e) { setError((e as Error).message); } }}>关闭工单</button>}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Pill tone={pillTone(AFTER_SALES_STATUS, active.status)}>{label(AFTER_SALES_STATUS, active.status)}</Pill>
              {afterSalesAlertLabel(active.alertState) && (
                <Pill tone={afterSalesAlertTone(active.alertState)}>{afterSalesAlertLabel(active.alertState)}</Pill>
              )}
              <Pill tone={pillTone(URGENCY, active.urgency)}>{label(URGENCY, active.urgency)}</Pill>
              <Pill tone="text-dim bg-steel/25">{label(AFTER_SALES_TYPE, active.orderType)}</Pill>
              {active.problemCategory && (
                <Pill tone="text-dim bg-steel/25">{PROBLEM_CATEGORY[active.problemCategory] || active.problemCategory}</Pill>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
              <Field label="合同号">
                <span className="mono text-xs">{active.contractNoSnapshot}</span>
              </Field>
              <Field label="服务金额">
                {active.serviceAmount != null ? (
                  <span className="mono text-brandhi">{money(active.serviceAmount)}</span>
                ) : (
                  <Dash />
                )}
              </Field>
              <Field label="派发日期">{date(active.dispatchDate)}</Field>
              <Field label="完成日期">{active.completedDate ? date(active.completedDate) : <Dash />}</Field>
              <Field label="服务人员">{active.assigneeNames || <Dash />}</Field>
              <Field label="满意度">
                {active.satisfaction ? (
                  <Pill tone={pillTone(SATISFACTION, active.satisfaction)}>{label(SATISFACTION, active.satisfaction)}</Pill>
                ) : (
                  <Dash />
                )}
              </Field>
            </div>

            <div>
              <span className="label block mb-1.5">故障描述</span>
              <div className="panel px-3.5 py-3 text-sm text-dim whitespace-pre-wrap break-words">{active.description}</div>
            </div>

            {active.serviceAddress && (
              <div>
                <span className="label block mb-1.5">服务地址</span>
                <div className="text-sm text-dim">{active.serviceAddress}</div>
              </div>
            )}

            {active.receiptContent && (
              <div>
                <span className="label block mb-1.5">服务回执</span>
                <div className="panel px-3.5 py-3 text-sm text-dim whitespace-pre-wrap break-words">
                  {active.receiptContent}
                </div>
              </div>
            )}

            <AfterSalesAttachments orderId={active.id} onCountChange={setAttachmentCount} />

            <div className="flex items-center gap-1.5 text-xs text-faint">
              <Phone size={12} /> 如需协助处理，请联系售后负责人
            </div>
          </div>
        </Sheet>
      )}
      {active && printInfo && <AfterSalesPrintSheet order={active} info={printInfo} />}
      {form && form.mode === "create" && (
        <AfterSalesCreateSheet
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}
      {form && form.mode === "status" && (
        <AfterSalesStatusSheet
          order={form.order}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}
      {form && form.mode === "receipt" && (
        <AfterSalesReceiptSheet
          order={form.order}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}
      {form && form.mode === "edit" && (
        <AfterSalesEditSheet
          order={form.order}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value?: number; tone: string }) {
  return (
    <div className="panel px-4 py-3">
      <p className="text-xs text-faint">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone}`}>{value ?? "—"}</p>
    </div>
  );
}

function AfterSalesPrintSheet({ order, info }: { order: AfterSalesRow; info: AfterSalesPrintInfo }) {
  const fields = [
    ["工单编号", order.orderNo], ["合同编号", order.contractNoSnapshot],
    ["客户名称", order.customerNameSnapshot], ["设备型号", order.equipmentModelSnapshot],
    ["工单类型", label(AFTER_SALES_TYPE, order.orderType)], ["紧急程度", label(URGENCY, order.urgency)],
    ["派发日期", date(order.dispatchDate)], ["完成日期", order.completedDate ? date(order.completedDate) : "—"],
    ["售后人员", order.assigneeNames || "—"], ["服务地址", order.serviceAddress || "—"],
  ];
  return <article className="after-sales-print-sheet" aria-hidden="true">
    <header><h1>{info.companyName || "售后服务工单"}</h1><p>售后服务工单</p></header>
    <table><tbody>{fields.map(([name, value]) => <tr key={name}><th>{name}</th><td>{value || "—"}</td></tr>)}</tbody></table>
    <section><h2>故障描述 / 服务要求</h2><p>{order.description || "—"}</p></section>
    <section><h2>涉及配件</h2><p>{order.parts?.map((part) => part.partName).join("、") || "—"}</p></section>
    <section><h2>服务回执</h2><p>{order.receiptContent || "—"}</p></section>
    <footer><p>{info.contactAddress}</p><p>{info.footerNote}</p><div className="signature-line">客户签字：____________________　日期：____________________</div></footer>
  </article>;
}
