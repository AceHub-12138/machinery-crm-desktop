import { useCallback, useEffect, useRef, useState } from "react";
import { Search, RefreshCw, ChevronLeft, ChevronRight, Phone, FileText, History, Plus, PenLine, Eye } from "lucide-react";
import { api, getCachedUser } from "../lib/api";
import {
  CUSTOMER_STATUS,
  CUSTOMER_LEVEL,
  CUSTOMER_TYPE,
  PAYMENT_STATUS,
  CONTRACT_STATUS,
  FOLLOW_TYPE,
  PROVINCE_OPTIONS,
  label,
  pillTone,
  money,
  moneyFull,
  date,
  dateTime,
} from "../lib/format";
import { Spinner, Empty, ErrorTip, Pill, Sheet, Field, Dash, PageHeader, ConfirmDialog, notify } from "../components/ui";
import { CustomerFormSheet, ContractFormSheet, FollowFormSheet } from "../components/crm-forms";
import { QuoteFormSheet } from "../components/quote-forms";
import { QuoteDetailSheet } from "../components/quote-detail";
import { QUOTE_LOCKED_MESSAGE, quoteContractAction, quoteSummary } from "../lib/quotes";
import type { CustomerRow, FollowRecordRow, CustomerQuoteRow, QuoteContractLink } from "../types";

const STATUS_OPTIONS = ["NEW_LEAD", "CONTACTED", "QUOTED", "NEGOTIATING", "WON", "LOST", "INACTIVE"];

export default function CustomersView({ focusId, initialFilters }: { focusId?: string; initialFilters?: Record<string, string | undefined> }) {
  const [search, setSearch] = useState(initialFilters?.search || "");
  const [status, setStatus] = useState(initialFilters?.status || "");
  const [level, setLevel] = useState(initialFilters?.level || "");
  const [province, setProvince] = useState(initialFilters?.province || "");
  const [assignedUserId, setAssignedUserId] = useState(initialFilters?.assignedUserId || "");
  const [salesUsers, setSalesUsers] = useState<{ id: string; name: string }[]>([]);
  const user = getCachedUser();
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [pagination, setPagination] = useState<{ page: number; totalPages: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<CustomerRow | null>(null);
  const [custForm, setCustForm] = useState<null | { mode: "create" } | { mode: "edit"; customer: CustomerRow }>(null);
  const [followForm, setFollowForm] = useState<CustomerRow | null>(null);
  const [quoteForm, setQuoteForm] = useState<CustomerRow | null>(null);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const res = await api<{ customers: CustomerRow[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }>(
        "/api/customers",
        { query: {
          page: String(page), pageSize: "30", search, status, level,
          province: province || undefined, assignedUserId: assignedUserId || undefined,
          region: initialFilters?.region, city: initialFilters?.city, tag: initialFilters?.tag,
          businessLine: initialFilters?.businessLine, kpiSalesUserId: initialFilters?.kpiSalesUserId,
          createdStart: initialFilters?.createdStart, createdEnd: initialFilters?.createdEnd,
        } },
      );
      if (requestId !== loadRequestRef.current) return;
      setRows(res.customers);
      setPagination(res.pagination);
    } catch (err) {
      if (requestId === loadRequestRef.current) setError((err as Error).message);
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [page, search, status, level, province, assignedUserId, initialFilters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => () => {
    loadRequestRef.current += 1;
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  // 从任务/提醒跳转定位：不在当前分页时按真实详情路由读取，禁止误开首条客户。
  useEffect(() => {
    if (!focusId || !rows) return;
    const hit = rows.find((row) => row.id === focusId);
    if (hit) {
      setActive(hit);
      return;
    }
    let alive = true;
    const encodedId = encodeURIComponent(focusId);
    Promise.all([
      api<CustomerRow>(`/api/customers/${encodedId}`),
      api<NonNullable<CustomerRow["contracts"]>>(`/api/customers/${encodedId}/contracts`),
    ])
      .then(([customer, contracts]) => { if (alive) setActive({ ...customer, contracts }); })
      .catch((reason) => { if (alive) setError((reason as Error).message); });
    return () => { alive = false; };
  }, [focusId, rows]);

  // 业务员下拉（服务端按权限裁剪：普通销售只返回自己）
  useEffect(() => {
    api<{ id: string; name: string }[]>("/api/users/active")
      .then((rows) => setSalesUsers(Array.isArray(rows) ? rows : []))
      .catch(() => setSalesUsers([]));
  }, []);

  const onSearchChange = (v: string) => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setPage(1);
      setSearch(v);
    }, 400);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <PageHeader title="客户管理" sub={`共 ${pagination?.total ?? "…"} 家 · 只显示您权限范围内的客户`}>
          <button className="btn-brand" onClick={() => setCustForm({ mode: "create" })}>
            <Plus size={15} /> 新建客户
          </button>
          <button className="btn-ghost !px-2.5" title="刷新" onClick={load}>
            {loading ? <Spinner className="!w-4 !h-4" /> : <RefreshCw size={15} />}
          </button>
        </PageHeader>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className="input !pl-8"
              placeholder="搜索公司 / 联系人 / 电话"
              defaultValue={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <select className="input !w-auto min-w-[100px]" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">全部状态</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{label(CUSTOMER_STATUS, s)}</option>
            ))}
          </select>
          <select className="input !w-auto min-w-[100px]" value={level} onChange={(e) => { setPage(1); setLevel(e.target.value); }}>
            <option value="">全部等级</option>
            {["A", "B", "C", "D"].map((l) => (
              <option key={l} value={l}>{label(CUSTOMER_LEVEL, l)}</option>
            ))}
          </select>
          {user?.role === "SUPER_ADMIN" && (
            <select className="input !w-auto min-w-[100px]" value={province} onChange={(e) => { setPage(1); setProvince(e.target.value); }} aria-label="省份筛选">
              <option value="">全部省份</option>
              {PROVINCE_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
          <select className="input !w-auto min-w-[100px]" value={assignedUserId} onChange={(e) => { setPage(1); setAssignedUserId(e.target.value); }} aria-label="业务员筛选">
            <option value="">全部业务员</option>
            {salesUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <div className="panel overflow-x-auto max-w-[1400px]">
          <table className="w-full border-collapse" style={{ minWidth: "900px" }}>
            <thead className="sticky top-0 bg-panel z-10">
              <tr>
                <th className="th" style={{ minWidth: "180px" }}>客户</th>
                <th className="th" style={{ minWidth: "120px" }}>电话</th>
                <th className="th" style={{ minWidth: "120px" }}>地区</th>
                <th className="th" style={{ minWidth: "60px" }}>等级</th>
                <th className="th" style={{ minWidth: "80px" }}>状态</th>
                <th className="th" style={{ minWidth: "80px" }}>负责人</th>
                <th className="th" style={{ minWidth: "100px" }}>最近跟进</th>
                <th className="th" style={{ minWidth: "100px" }}>下次跟进</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((c) => (
                <tr key={c.id} className="row-hover" onClick={() => setActive(c)}>
                  <td className="td">
                    <div className="font-medium">{c.companyName}</div>
                    <div className="text-xs text-faint mt-0.5">{c.contactName}</div>
                  </td>
                  <td className="td mono text-dim">{c.phone || <Dash />}</td>
                  <td className="td text-dim">{[c.province, c.city].filter(Boolean).join(" ") || <Dash />}</td>
                  <td className="td mono">{c.customerLevel}</td>
                  <td className="td">
                    <Pill tone={pillTone(CUSTOMER_STATUS, c.status)}>{label(CUSTOMER_STATUS, c.status)}</Pill>
                  </td>
                  <td className="td text-dim">{c.assignedUser?.name || <Dash />}</td>
                  <td className="td text-dim">{c.lastFollowDate ? date(c.lastFollowDate) : <Dash />}</td>
                  <td className="td">
                    {c.nextFollowDate ? (
                      <span className="mono text-warn text-xs">{date(c.nextFollowDate)}</span>
                    ) : (
                      <Dash />
                    )}
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
          {!loading && !error && rows && rows.length === 0 && <Empty text="没有符合条件的客户" />}
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4 text-sm text-dim">
            <button className="btn-ghost !px-2" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={15} />
            </button>
            <span className="mono text-xs">
              第 {pagination.page} / {pagination.totalPages} 页
            </span>
            <button
              className="btn-ghost !px-2"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>

      {active && (
        <CustomerDetail
          customer={active}
          refresh={detailRefresh}
          onClose={() => setActive(null)}
          onEdit={() => setCustForm({ mode: "edit", customer: active })}
          onFollow={() => setFollowForm(active)}
          onQuote={() => setQuoteForm(active)}
          onContractSaved={() => { setDetailRefresh((n) => n + 1); load(); }}
        />
      )}

      {custForm && (
        <CustomerFormSheet
          customer={custForm.mode === "edit" ? custForm.customer : null}
          onClose={() => setCustForm(null)}
          onSaved={() => {
            setCustForm(null);
            setActive(null);
            load();
          }}
        />
      )}
      {quoteForm && <QuoteFormSheet customer={quoteForm} onClose={() => setQuoteForm(null)} onSaved={() => { setQuoteForm(null); setDetailRefresh((n) => n + 1); load(); }} />}
      {followForm && (
        <FollowFormSheet
          customer={followForm}
          onClose={() => setFollowForm(null)}
          onSaved={() => {
            setFollowForm(null);
            setDetailRefresh((n) => n + 1);
            load();
          }}
        />
      )}
    </div>
  );
}

function CustomerDetail({
  customer,
  refresh,
  onClose,
  onEdit,
  onFollow,
  onQuote,
  onContractSaved,
}: {
  customer: CustomerRow;
  refresh: number;
  onClose: () => void;
  onEdit: () => void;
  onFollow: () => void;
  onQuote: () => void;
  onContractSaved: () => void;
}) {
  const [tab, setTab] = useState("info");
  const [quotes, setQuotes] = useState<CustomerQuoteRow[] | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [busyQuoteId, setBusyQuoteId] = useState("");
  const [detailQuote, setDetailQuote] = useState<CustomerQuoteRow | null>(null);
  const [detailLink, setDetailLink] = useState<QuoteContractLink | null>(null);
  const [contractDraft, setContractDraft] = useState<CustomerQuoteRow | null>(null);
  const [updateConfirm, setUpdateConfirm] = useState<{ quote: CustomerQuoteRow; contractNo: string } | null>(null);
  const [updating, setUpdating] = useState(false);
  const quoteRequestRef = useRef(0);
  const loadQuotes = useCallback(async () => {
    const requestId = ++quoteRequestRef.current;
    setQuoteError("");
    try {
      const result = await api<CustomerQuoteRow[]>(`/api/customers/${customer.id}/quotes`);
      if (requestId === quoteRequestRef.current) setQuotes(result);
    } catch (error) {
      if (requestId === quoteRequestRef.current) setQuoteError((error as Error).message);
    }
  }, [customer.id]);
  useEffect(() => {
    void loadQuotes();
    return () => { quoteRequestRef.current += 1; };
  }, [loadQuotes, refresh]);
  /** 一键转合同：与平台一致的三分支——未生成合同→新建（预填报价）；已锁定→提示申请解锁；否则→确认后用报价更新合同 */
  const startConvert = async (quote: CustomerQuoteRow) => {
    if (busyQuoteId) return;
    setBusyQuoteId(quote.id);
    setQuoteError("");
    try {
      const link = await api<QuoteContractLink>(`/api/customer-quotes/${quote.id}/contract`);
      const action = quoteContractAction(link);
      if (action === "create") {
        setDetailQuote(null);
        setContractDraft(quote);
      } else if (action === "locked") {
        setQuoteError(QUOTE_LOCKED_MESSAGE);
      } else {
        setDetailQuote(null);
        setUpdateConfirm({ quote, contractNo: link.contract!.contractNo });
      }
    } catch (error) {
      setQuoteError((error as Error).message);
    } finally {
      setBusyQuoteId("");
    }
  };

  const applyUpdateContract = async () => {
    if (!updateConfirm || updating) return;
    setUpdating(true);
    setQuoteError("");
    try {
      await api(`/api/customer-quotes/${updateConfirm.quote.id}/update-contract`, { method: "POST" });
      notify("已用报价更新合同明细");
      setUpdateConfirm(null);
      await loadQuotes();
      onContractSaved();
    } catch (error) {
      setQuoteError((error as Error).message);
      setUpdateConfirm(null);
    } finally {
      setUpdating(false);
    }
  };

  const openQuoteDetail = async (quote: CustomerQuoteRow) => {
    setDetailQuote(quote);
    setDetailLink(null);
    try {
      setDetailLink(await api<QuoteContractLink>(`/api/customer-quotes/${quote.id}/contract`));
    } catch {
      // 详情页关联合同查询失败不阻断明细展示
      setDetailLink({ contract: null, locked: false, canEdit: true });
    }
  };
  const [follows, setFollows] = useState<FollowRecordRow[] | null>(null);
  const [followErr, setFollowErr] = useState("");

  useEffect(() => {
    let alive = true;
    setFollows(null);
    setFollowErr("");
    api<FollowRecordRow[]>("/api/follows", { query: { customerId: customer.id } })
      .then((rows) => alive && setFollows(rows))
      .catch((err) => alive && setFollowErr((err as Error).message));
    return () => {
      alive = false;
    };
  }, [customer.id, refresh]);

  const contracts = customer.contracts || [];
  const totalAmount = contracts.reduce((sum, c) => sum + Number(c.amount || 0), 0);

  return (
    <Sheet
      title={customer.companyName}
      subtitle={`${customer.contactName || ""}${customer.region ? ` · ${customer.region}` : ""}`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-end gap-2">
          <button className="btn-ghost" onClick={onEdit}>
            <PenLine size={13} /> 编辑
          </button>
          <button className="btn-brand" onClick={onFollow}>
            <History size={13} /> 写跟进
          </button>
          <button className="btn-ghost" onClick={onQuote}>
            <Plus size={13} /> 创建报价
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Pill tone={pillTone(CUSTOMER_STATUS, customer.status)}>{label(CUSTOMER_STATUS, customer.status)}</Pill>
          <Pill tone="text-dim bg-steel/25">{label(CUSTOMER_LEVEL, customer.customerLevel)}</Pill>
          {customer.businessLine && <Pill tone="text-dim bg-steel/25">{customer.businessLine}</Pill>}
        </div>

        <div className="flex gap-1 border-b border-line/60">
          {[["info", "客户信息"], ["quotes", `报价（${quotes?.length ?? "…"}）`]].map(([key, text]) => <button key={key} className={`px-3 py-2 text-xs ${tab === key ? "text-brandhi border-b-2 border-brandhi" : "text-faint"}`} onClick={() => setTab(key)}>{text}</button>)}
        </div>
        {tab === "quotes" ? <div className="flex flex-col gap-3">
          {quoteError && <div className="text-xs text-bad">{quoteError}</div>}
          {quotes?.length === 0 && <div className="text-xs text-faint py-3">暂无报价记录</div>}
          {quotes?.map((q) => {
            const summary = quoteSummary(q);
            return <div key={q.id} className="panel px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="mono font-medium text-brandhi">{moneyFull(summary.total, q.currency)}</span>
                {q.sourceContract ? (
                  <Pill tone="text-ok bg-ok/10">已转合同 {q.sourceContract.contractNo}</Pill>
                ) : (
                  <Pill tone="text-dim bg-steel/25">未转合同</Pill>
                )}
              </div>
              <div className="mt-1 text-xs text-faint">
                {dateTime(q.createdAt)}
                {q.createdBy?.name ? ` · ${q.createdBy.name}` : ""}
                {` · 产品 ${summary.mainCount} 项`}
                {summary.optionalCount ? ` · 选配 ${summary.optionalCount} 项` : ""}
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {summary.breakdown.map((item) => (
                  <li className="flex items-center gap-2 text-xs" key={item.key}>
                    <span className={item.itemType === "MAIN" ? "text-brandhi" : "text-faint"}>{item.itemLabel}</span>
                    <span className="min-w-0 flex-1 truncate">{item.name || item.model || "—"}</span>
                    <span className="mono shrink-0 text-faint">单价 {money(item.unitPrice, q.currency)} × {item.quantity}</span>
                    <span className="mono shrink-0 text-dim">小计 {money(item.subtotal, q.currency)}</span>
                  </li>
                ))}
              </ul>
              {q.remark && <p className="mt-2 text-xs text-dim">备注：{q.remark}</p>}
              <div className="mt-2 flex items-center gap-2">
                <button className="btn-ghost !py-1.5 text-xs" onClick={() => void openQuoteDetail(q)}>
                  <Eye size={12} /> 详情
                </button>
                <button className="btn-ghost !py-1.5 text-xs" disabled={busyQuoteId === q.id} onClick={() => void startConvert(q)}>
                  {busyQuoteId === q.id ? <Spinner className="!h-3.5 !w-3.5" /> : <RefreshCw size={12} />}
                  {q.sourceContract ? "用报价更新合同" : "一键转合同"}
                </button>
              </div>
            </div>;
          })}
          {detailQuote && <QuoteDetailSheet
            quote={detailQuote}
            link={detailLink}
            busy={busyQuoteId === detailQuote.id}
            onClose={() => { setDetailQuote(null); setDetailLink(null); }}
            onConvert={() => void startConvert(detailQuote)}
          />}
          {contractDraft && <ContractFormSheet
            contract={null}
            quote={{ id: contractDraft.id, customerId: customer.id, currency: contractDraft.currency, remark: contractDraft.remark, items: contractDraft.items }}
            onClose={() => setContractDraft(null)}
            onSaved={() => { setContractDraft(null); void loadQuotes(); onContractSaved(); }}
          />}
          {updateConfirm && <ConfirmDialog
            title={`该报价已生成合同 ${updateConfirm.contractNo}`}
            message="是否用该报价的明细更新对应的客户合同？平台会删除原合同明细并按报价重建，若新金额低于已收款金额会被拒绝。"
            confirmText="是，更新合同"
            busy={updating}
            onCancel={() => setUpdateConfirm(null)}
            onConfirm={() => void applyUpdateContract()}
          />}
        </div> : <>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <Field label="联系电话">
            {customer.phone ? (
              <span className="mono flex items-center gap-1.5">
                <Phone size={12} className="text-faint" />
                {customer.phone}
              </span>
            ) : (
              <Dash />
            )}
          </Field>
          <Field label="邮箱">{customer.email || <Dash />}</Field>
          <Field label="微信">{customer.wechat || <Dash />}</Field>
          <Field label="WhatsApp">{customer.whatsapp || <Dash />}</Field>
          <Field label="省 / 市">{[customer.province, customer.city].filter(Boolean).join(" ") || <Dash />}</Field>
          <Field label="客户来源">{customer.customerSource || <Dash />}</Field>
          <Field label="客户类型">{customer.customerType ? label(CUSTOMER_TYPE, customer.customerType) : <Dash />}</Field>
          <Field label="归属业务员 / 负责人">
            {customer.assignedUser?.name || <span className="text-faint">未指定</span>}
          </Field>
          <Field label="创建时间">{dateTime(customer.createdAt)}</Field>
          <Field label="下次跟进">{customer.nextFollowDate ? date(customer.nextFollowDate) : <Dash />}</Field>
        </div>

        {customer.address && (
          <Field label="地址">
            <span className="text-dim">{customer.address}</span>
          </Field>
        )}
        {customer.remark && (
          <Field label="备注">
            <span className="text-dim">{customer.remark}</span>
          </Field>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="label flex items-center gap-1.5">
              <FileText size={12} /> 合同概况（{contracts.length}）
            </span>
            {contracts.length > 0 && <span className="mono text-xs text-brandhi">{money(totalAmount)}</span>}
          </div>
          {contracts.length === 0 ? (
            <div className="text-xs text-faint py-2">暂无合同</div>
          ) : (
            <div className="panel divide-y divide-line/50">
              {contracts.map((ct) => (
                <div key={ct.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mono text-xs text-dim">{ct.contractNo || ct.id.slice(0, 8)}</div>
                    <div className="mono text-sm mt-0.5">{money(ct.amount)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Pill tone={pillTone(PAYMENT_STATUS, ct.paymentStatus)}>{label(PAYMENT_STATUS, ct.paymentStatus)}</Pill>
                    <span className="text-[11px] text-faint">{label(CONTRACT_STATUS, ct.contractStatus)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="label flex items-center gap-1.5 mb-2">
            <History size={12} /> 跟进记录
          </div>
          {followErr && <div className="text-xs text-bad">{followErr}</div>}
          {!followErr && follows === null && (
            <div className="py-6 flex justify-center">
              <Spinner />
            </div>
          )}
          {follows && follows.length === 0 && <div className="text-xs text-faint py-2">暂无跟进记录</div>}
          {follows && follows.length > 0 && (
            <div className="flex flex-col gap-0">
              {follows.map((f) => (
                <div key={f.id} className="border-l-2 border-line pl-3.5 py-2 ml-1 relative">
                  <span className="absolute -left-[4.5px] top-4 w-2 h-2 rounded-full bg-steel" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-brandhi">{FOLLOW_TYPE[f.followType] || f.followType}</span>
                    <span className="text-[11px] text-faint mono">{dateTime(f.createdAt)}</span>
                  </div>
                  <div className="text-sm mt-1 whitespace-pre-wrap break-words">{f.content}</div>
                  {f.result && <div className="text-xs text-dim mt-1">结果：{f.result}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
        </>}
      </div>
    </Sheet>
  );
}
