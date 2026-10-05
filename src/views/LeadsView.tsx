import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Flame, RefreshCw, Search, UserCheck, X } from "lucide-react";
import { api, getCachedUser } from "../lib/api";
import { LEAD_REVIEW, LEAD_SOURCE, dateTime, label, pillTone } from "../lib/format";
import {
  HUMAN_LEAD_REVIEW_STATUSES,
  LEAD_FEEDBACK_REASON_LABELS,
  leadFeedbackReasonsForStatus,
  type LeadFeedbackReasonCode,
} from "../lib/lead-feedback";
import { Dash, Empty, ErrorTip, PageHeader, Pill, SearchSelect, Spinner, notify, showToast } from "../components/ui";
import { LeadDetail, type LeadUserSummary } from "../components/lead-detail";
import type { LeadRow } from "../types";

/** 平台 batch-invalid 单次上限（schema .max(100)） */
const BATCH_LIMIT = 100;

export default function LeadsView() {
  const isAdmin = useMemo(() => getCachedUser()?.role === "SUPER_ADMIN", []);

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<LeadRow[] | null>(null);
  const [pagination, setPagination] = useState<{ total: number; page: number; totalPages: number } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkReason, setBulkReason] = useState<LeadFeedbackReasonCode | "">("");
  const [bulkComment, setBulkComment] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [operating, setOperating] = useState(false);

  const [assignees, setAssignees] = useState<LeadUserSummary[]>([]);
  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const result = await api<{ items: LeadRow[]; pagination: { total: number; page: number; totalPages: number } }>("/api/crm/leads", {
        query: {
          page: String(page),
          pageSize: "30",
          reviewStatus,
          searchKeyword: search,
          // 平台默认排除无效线索：仅在未选择意向状态时下发 excludeInvalid=1
          excludeInvalid: reviewStatus ? undefined : "1",
          assignedUserId: isAdmin ? assignedUserId : undefined,
        },
      });
      if (requestId !== loadRequestRef.current) return;
      setRows(result.items || []);
      setPagination(result.pagination);
      setSelectedIds(new Set());
    } catch (loadError) {
      if (requestId === loadRequestRef.current) setError((loadError as Error).message);
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [page, reviewStatus, search, assignedUserId, isAdmin]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { loadRequestRef.current += 1; }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setSearch(searchInput); }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // SUPER_ADMIN-only：候选负责人接口对非超管 403，只在超管时加载（同时用于筛选与批量指派）。
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    api<LeadUserSummary[]>("/api/crm/leads/assignees")
      .then((data) => { if (alive) setAssignees(Array.isArray(data) ? data : []); })
      .catch(() => { if (alive) setAssignees([]); });
    return () => { alive = false; };
  }, [isAdmin]);

  const selectedLeads = useMemo(
    () => (rows || []).filter((lead) => selectedIds.has(lead.id)),
    [rows, selectedIds],
  );

  const invalidReasons = useMemo(() => leadFeedbackReasonsForStatus("INVALID"), []);

  const toggleLead = (leadId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const toggleCurrentPage = () => {
    setSelectedIds((current) => (rows && current.size === rows.length
      ? new Set()
      : new Set((rows || []).map((lead) => lead.id))));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkReason("");
    setBulkComment("");
    setBulkAssignee("");
  };

  const assignSelected = async () => {
    if (!bulkAssignee || selectedLeads.length === 0) {
      showToast("请选择线索和目标销售负责人", "error");
      return;
    }
    if (selectedLeads.length > BATCH_LIMIT) {
      showToast(`一次最多指派 ${BATCH_LIMIT} 条线索`, "error");
      return;
    }
    setOperating(true);
    try {
      await api("/api/crm/leads/assignments", {
        method: "POST",
        body: { leadIds: selectedLeads.map((lead) => lead.id), assignedUserId: bulkAssignee },
      });
      notify(`已完成 ${selectedLeads.length} 条线索指派`);
      await load();
      setBulkAssignee("");
    } catch (reason) {
      showToast((reason as Error).message, "error");
    } finally {
      setOperating(false);
    }
  };

  const invalidateSelected = async () => {
    if (!bulkReason || selectedLeads.length === 0) {
      showToast("请选择线索和无效原因", "error");
      return;
    }
    if (selectedLeads.length > BATCH_LIMIT) {
      showToast(`一次最多标记 ${BATCH_LIMIT} 条线索`, "error");
      return;
    }
    if (bulkReason === "OTHER" && !bulkComment.trim()) {
      showToast("选择“其他”原因时必须填写备注", "error");
      return;
    }
    setOperating(true);
    try {
      await api("/api/crm/leads/batch-invalid", {
        method: "POST",
        body: {
          items: selectedLeads.map((lead) => ({ leadId: lead.id, expectedFeedbackVersion: lead.feedbackVersion })),
          reviewReasonCode: bulkReason,
          comment: bulkComment.trim() || undefined,
        },
      });
      notify(`已将 ${selectedLeads.length} 条线索标记为无效`);
      clearSelection();
      await load();
    } catch (reason) {
      showToast((reason as Error).message, "error");
    } finally {
      setOperating(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="px-6 pb-4 pt-5">
        <PageHeader title="线索池" sub={`共 ${pagination?.total ?? "…"} 条线索 · 含 AI 获客助手产出的线索`}>
          <div className="relative w-60">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input !pl-8" placeholder="搜索获客关键词" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
          </div>
          <select className="input !w-auto" value={reviewStatus} onChange={(event) => { setPage(1); setReviewStatus(event.target.value); }}>
            <option value="">全部意向</option>
            {["PENDING", ...HUMAN_LEAD_REVIEW_STATUSES].map((status) => <option key={status} value={status}>{label(LEAD_REVIEW, status)}</option>)}
          </select>
          {isAdmin && (
            <select className="input !w-auto" value={assignedUserId} onChange={(event) => { setPage(1); setAssignedUserId(event.target.value); }} aria-label="指派人筛选">
              <option value="">全部指派人</option>
              {assignees.map((entry) => <option key={entry.id} value={entry.id}>{entry.name || entry.email || entry.id}</option>)}
            </select>
          )}
          <button className="btn-ghost !px-2.5" onClick={() => void load()}>{loading ? <Spinner className="!h-4 !w-4" /> : <RefreshCw size={15} />}</button>
        </PageHeader>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-4">
        {selectedLeads.length > 0 && (
          <div className="panel mb-3 flex flex-wrap items-center gap-2 px-3.5 py-3">
            <span className="text-sm font-medium">已选择 {selectedLeads.length} 条</span>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <SearchSelect
                  className="w-52"
                  value={bulkAssignee}
                  onChange={setBulkAssignee}
                  placeholder="选择销售负责人"
                  searchPlaceholder="搜索销售姓名…"
                  options={assignees.map((entry) => ({
                    value: entry.id,
                    label: entry.name || entry.email || entry.id,
                    sub: entry.role === "FOREIGN_TRADE" ? "外贸销售" : "销售",
                  }))}
                />
                <button className="btn-ghost whitespace-nowrap" disabled={operating || !bulkAssignee} onClick={() => void assignSelected()}>
                  <UserCheck size={14} /> 批量指派销售
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <select className="input !w-auto" value={bulkReason} onChange={(event) => setBulkReason(event.target.value as LeadFeedbackReasonCode | "")} aria-label="批量无效原因">
                <option value="">选择无效原因</option>
                {invalidReasons.map((reason) => <option key={reason} value={reason}>{LEAD_FEEDBACK_REASON_LABELS[reason]}</option>)}
              </select>
              {bulkReason === "OTHER" && (
                <input className="input !w-56" maxLength={2000} placeholder="填写无效原因" value={bulkComment} onChange={(event) => setBulkComment(event.target.value)} aria-label="批量无效备注" />
              )}
              <button className="btn-ghost whitespace-nowrap !text-bad" disabled={operating || !bulkReason} onClick={() => void invalidateSelected()}>
                批量标记无效
              </button>
            </div>
            <button className="btn-ghost !px-2" disabled={operating} onClick={clearSelection} title="取消选择"><X size={15} /></button>
          </div>
        )}

        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-panel"><tr>
              <th className="th w-10 text-center">
                <input
                  type="checkbox"
                  aria-label="全选当前页"
                  checked={(rows?.length || 0) > 0 && selectedIds.size === rows?.length}
                  disabled={loading || !rows?.length}
                  onChange={toggleCurrentPage}
                />
              </th>
              {["公司名称", "联系人", "电话", "获客关键词", "来源", "AI 评分", "意向判定", "负责人", "版本", "创建时间", ""].map((heading, index) => (
                <th className="th" key={`${heading}-${index}`}>{heading}</th>
              ))}
            </tr></thead>
            <tbody>{rows?.map((lead, index) => (
              <tr key={lead.id} onClick={() => setDetailId(lead.id)} className="row-hover fade-up cursor-pointer" style={{ animationDelay: `${Math.min(index * 25, 400)}ms` }}>
                <td className="td text-center" onClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" aria-label={`选择 ${lead.companyName}`} checked={selectedIds.has(lead.id)} onChange={() => toggleLead(lead.id)} />
                </td>
                <td className="td font-medium">{lead.companyName}</td>
                <td className="td text-dim">{lead.contactName || <Dash />}</td>
                <td className="td mono text-dim">{lead.phone || <Dash />}</td>
                <td className="td text-dim">{lead.searchKeyword || <Dash />}</td>
                <td className="td text-dim">{label(LEAD_SOURCE, lead.source)}</td>
                <td className="td">{lead.aiScore != null ? <span className="mono">{lead.aiScore >= 80 && <Flame size={13} className="inline text-brand" />} {lead.aiScore}</span> : <Dash />}</td>
                <td className="td"><Pill tone={pillTone(LEAD_REVIEW, lead.reviewStatus)}>{label(LEAD_REVIEW, lead.reviewStatus)}</Pill></td>
                <td className="td text-dim">{lead.assignedUser?.name || "待分配"}</td>
                <td className="td mono text-xs text-dim">v{lead.feedbackVersion}</td>
                <td className="td mono text-xs text-faint">{dateTime(lead.createdAt)}</td>
                <td className="td"><button className="btn-ghost !px-2" onClick={(event) => { event.stopPropagation(); setDetailId(lead.id); }} title="查看详情"><Eye size={15} /></button></td>
              </tr>
            ))}</tbody>
          </table>
          {loading && !rows && <div className="flex justify-center py-16"><Spinner /></div>}
          {!loading && error && <ErrorTip message={error} onRetry={() => void load()} />}
          {!loading && !error && rows?.length === 0 && <Empty text="没有符合条件的线索" />}
        </div>
        {(pagination?.totalPages || 0) > 1 && <div className="mt-4 flex items-center justify-center gap-3 text-sm text-dim"><button className="btn-ghost !px-2" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button><span>第 {pagination?.page} / {pagination?.totalPages} 页</span><button className="btn-ghost !px-2" disabled={page >= (pagination?.totalPages || 1)} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button></div>}
      </div>

      {detailId && (
        <LeadDetail
          key={detailId}
          leadId={detailId}
          canAssign={isAdmin}
          onClose={() => setDetailId(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}
