import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw, Save } from "lucide-react";
import { ApiError, api } from "../lib/api";
import { LEAD_REVIEW, LEAD_SOURCE, dateTime, label, pillTone } from "../lib/format";
import {
  buildLeadFeedbackPayload,
  HUMAN_LEAD_REVIEW_STATUSES,
  LEAD_FEEDBACK_REASON_LABELS,
  LEAD_FEEDBACK_STATUS_LABELS,
  leadFeedbackReasonsForStatus,
  type HumanLeadReviewStatus,
  type LeadFeedbackReasonCode,
} from "../lib/lead-feedback";
import { Dash, ErrorTip, Field, Pill, SearchSelect, Sheet, Spinner, notify, showToast } from "./ui";

/* ---------- 平台 GET /api/crm/leads/{id} 返回结构（本地声明，避免改共享 types.ts） ---------- */

export interface LeadUserSummary {
  id: string;
  name?: string | null;
  email?: string;
  role?: string;
}

export interface LeadFeedbackEventRow {
  id: string;
  leadId?: string;
  reviewStatus: string | null;
  reviewReasonCode: string | null;
  comment: string | null;
  reviewedByUserId?: string | null;
  reviewedByUser?: LeadUserSummary | null;
  reviewedAt: string;
}

export interface LeadDetailRow {
  id: string;
  companyName: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  source: string;
  sourceUrl?: string | null;
  searchKeyword?: string | null;
  aiScore?: number | null;
  profile?: unknown;
  sourceModelVersion?: string | null;
  extractorVersion?: string | null;
  reviewStatus: string;
  assignedUserId?: string | null;
  assignedUser?: LeadUserSummary | null;
  reviewedByUserId?: string | null;
  reviewedByUser?: LeadUserSummary | null;
  reviewedAt?: string | null;
  feedbackVersion: number;
  createdAt: string;
  updatedAt: string;
  feedbackEvents: LeadFeedbackEventRow[];
}

function userName(user: LeadUserSummary | null | undefined, fallbackId?: string | null) {
  return user?.name || user?.email || fallbackId || "未记录";
}

/** 平台 presentation.ts safeLeadSourceUrl 的本地等价实现：只放行 http/https */
function safeSourceUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/* ---------- 平台 presentation.ts buildLeadProfileSections 的本地等价实现 ---------- */

type ProfileSection = { title: string; values: string[]; kind: "text" | "list" };

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function textValues(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(textValue).filter((entry): entry is string => Boolean(entry));
}
function intentLevelLabel(value: unknown) {
  const normalized = textValue(value)?.toUpperCase();
  if (normalized === "HIGH") return "高意向";
  if (normalized === "MEDIUM" || normalized === "MID") return "中意向";
  if (normalized === "LOW") return "低意向";
  return textValue(value) || null;
}
function confidenceLabel(value: unknown) {
  const normalized = textValue(value)?.toUpperCase();
  if (normalized === "HIGH") return "高";
  if (normalized === "MEDIUM" || normalized === "MID") return "中";
  if (normalized === "LOW") return "低";
  return textValue(value) || null;
}
function pushSection(sections: ProfileSection[], title: string, values: string[], kind: ProfileSection["kind"]) {
  if (values.length > 0) sections.push({ title, values, kind });
}
function buildProfileSections(profile: unknown): ProfileSection[] {
  const record = profile && typeof profile === "object" && !Array.isArray(profile)
    ? profile as Record<string, unknown>
    : null;
  if (!record) return [];
  const sections: ProfileSection[] = [];
  const summary = textValue(record.summary);
  const industry = textValue(record.industry);
  const intentLevel = intentLevelLabel(record.intentLevel);
  const intent = textValue(record.intent);
  const scale = textValue(record.scale);
  const contactability = textValue(record.contactability);
  const confidence = confidenceLabel(record.confidence);
  const evidence = textValues(record.evidence);
  const reason = textValue(record.reason);
  const needs = [
    ...textValues(record.processNeeds),
    ...textValues(record.businessScope),
    ...textValues(record.purchaseSignals),
  ];
  const advice = textValue(record.salesAdvice)
    || textValue(record.followUpSuggestion)
    || textValue(record.recommendation);

  pushSection(sections, "客户概况", summary ? [summary] : [], "text");
  pushSection(sections, "所属行业", industry ? [industry] : [], "text");
  pushSection(sections, "AI 意向判断", intentLevel ? [intentLevel] : [], "text");
  pushSection(sections, "AI 需求描述", intent ? [intent] : [], "text");
  pushSection(sections, "企业规模", scale ? [scale] : [], "text");
  pushSection(sections, "联系情况", contactability ? [contactability] : [], "text");
  pushSection(sections, "AI 判断置信度", confidence ? [confidence] : [], "text");
  pushSection(sections, "重点依据", evidence.length ? evidence : reason ? [reason] : [], evidence.length ? "list" : "text");
  pushSection(sections, "潜在需求", needs, "list");
  pushSection(sections, "风险提示", textValues(record.riskFlags), "list");
  pushSection(sections, "销售建议", advice ? [advice] : [], "text");
  return sections;
}

export function LeadDetail({
  leadId,
  canAssign,
  onClose,
  onChanged,
}: {
  leadId: string;
  canAssign: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [lead, setLead] = useState<LeadDetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadRef = useRef(0);

  const [assignees, setAssignees] = useState<LeadUserSummary[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [assigneesError, setAssigneesError] = useState("");
  const [assignmentTarget, setAssignmentTarget] = useState("");
  const [assigning, setAssigning] = useState(false);

  const [feedbackStatus, setFeedbackStatus] = useState<HumanLeadReviewStatus | "">("");
  const [feedbackReason, setFeedbackReason] = useState<LeadFeedbackReasonCode | "">("");
  const [comment, setComment] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const requestId = ++loadRef.current;
    setLoading(true);
    setError("");
    try {
      const detail = await api<LeadDetailRow>(`/api/crm/leads/${encodeURIComponent(leadId)}`);
      if (requestId !== loadRef.current) return;
      setLead(detail);
      setAssignmentTarget(detail.assignedUserId || "");
    } catch (reason) {
      if (requestId === loadRef.current) setError((reason as Error).message);
    } finally {
      if (requestId === loadRef.current) setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { loadRef.current += 1; }, []);

  // SUPER_ADMIN-only：候选负责人接口对非超管直接 403，只在可分配时请求。
  useEffect(() => {
    if (!canAssign) return;
    let alive = true;
    setAssigneesLoading(true);
    setAssigneesError("");
    api<LeadUserSummary[]>("/api/crm/leads/assignees")
      .then((data) => { if (alive) setAssignees(Array.isArray(data) ? data : []); })
      .catch((reason) => { if (alive) setAssigneesError((reason as Error).message); })
      .finally(() => { if (alive) setAssigneesLoading(false); });
    return () => { alive = false; };
  }, [canAssign]);

  const submitFeedback = async () => {
    if (!lead || !feedbackStatus || !feedbackReason) {
      setFeedbackError("请选择反馈状态和原因");
      return;
    }
    setFeedbackError("");
    setSubmitting(true);
    try {
      const body = buildLeadFeedbackPayload({
        reviewStatus: feedbackStatus,
        reviewReasonCode: feedbackReason,
        comment,
        expectedFeedbackVersion: lead.feedbackVersion,
      });
      await api(`/api/crm/leads/${encodeURIComponent(lead.id)}/feedback`, { method: "POST", body });
      setFeedbackStatus("");
      setFeedbackReason("");
      setComment("");
      notify("反馈已保存");
      await load();
      onChanged?.();
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 409) {
        await load();
        showToast("该线索的反馈已被更新，详情已刷新，请重新提交", "error");
      } else {
        setFeedbackError((saveError as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const assignLead = async () => {
    if (!lead || !assignmentTarget) {
      showToast("请选择销售负责人", "error");
      return;
    }
    setAssigning(true);
    try {
      await api("/api/crm/leads/assignments", {
        method: "POST",
        body: { leadIds: [lead.id], assignedUserId: assignmentTarget },
      });
      notify(lead.assignedUserId ? "负责人已改派" : "负责人已分配");
      await load();
      onChanged?.();
    } catch (reason) {
      showToast((reason as Error).message, "error");
    } finally {
      setAssigning(false);
    }
  };

  const profileSections = lead ? buildProfileSections(lead.profile) : [];
  const sourceUrl = lead ? safeSourceUrl(lead.sourceUrl) : null;
  const reasons = feedbackStatus ? leadFeedbackReasonsForStatus(feedbackStatus) : [];

  return (
    <Sheet title={lead?.companyName || "线索详情"} subtitle={lead?.contactName ? `联系人：${lead.contactName}` : "AI 获客线索"} onClose={onClose}>
      {loading && !lead && <div className="flex justify-center py-16"><Spinner /></div>}
      {!loading && !lead && error && <ErrorTip message={error} onRetry={() => void load()} />}

      {lead && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={pillTone(LEAD_REVIEW, lead.reviewStatus)}>{label(LEAD_REVIEW, lead.reviewStatus)}</Pill>
              <span className="mono text-xs text-faint">v{lead.feedbackVersion}</span>
            </div>
            <button className="btn-ghost !px-2.5" onClick={() => void load()} title="刷新详情">
              {loading ? <Spinner className="!h-4 !w-4" /> : <RefreshCw size={15} />}
            </button>
          </div>

          {error && <div className="text-xs text-bad">{error}</div>}

          <div>
            <div className="label mb-2">线索信息</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
              <Field label="联系人">{lead.contactName || <Dash />}</Field>
              <Field label="电话">{lead.phone ? <span className="mono">{lead.phone}</span> : <Dash />}</Field>
              <Field label="邮箱">{lead.email || <Dash />}</Field>
              <Field label="AI 评分">{lead.aiScore != null ? <span className="mono">{lead.aiScore}</span> : <Dash />}</Field>
              <Field label="获客关键词">{lead.searchKeyword || <Dash />}</Field>
              <Field label="来源">{label(LEAD_SOURCE, lead.source)}</Field>
              <Field label="当前负责人">{lead.assignedUser?.name || lead.assignedUser?.email || <span className="text-faint">未指派</span>}</Field>
              <Field label="创建时间">{dateTime(lead.createdAt)}</Field>
            </div>
            {sourceUrl && (
              <a className="mt-2 inline-flex items-center gap-1 text-xs text-brandhi hover:underline" href={sourceUrl} target="_blank" rel="noreferrer">
                查看来源页面 <ExternalLink size={12} />
              </a>
            )}
          </div>

          <div>
            <div className="label mb-2">来源与模型</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
              <Field label="来源 URL">{sourceUrl || <Dash />}</Field>
              <Field label="模型版本">{lead.sourceModelVersion || <Dash />}</Field>
              <Field label="提取器版本">{lead.extractorVersion || <Dash />}</Field>
              <Field label="最后更新时间">{dateTime(lead.updatedAt)}</Field>
            </div>
          </div>

          <div>
            <div className="label mb-2">AI 画像</div>
            {profileSections.length === 0 ? (
              <p className="text-xs text-faint py-1">暂无 AI 画像</p>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {profileSections.map((section) => (
                  <section key={section.title} className="panel px-3 py-2.5">
                    <h3 className="text-xs font-medium text-ink">{section.title}</h3>
                    {section.kind === "list" ? (
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-5 text-dim">
                        {section.values.map((value) => <li key={value}>{value}</li>)}
                      </ul>
                    ) : (
                      <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-dim">{section.values.join("；")}</p>
                    )}
                  </section>
                ))}
              </div>
            )}
          </div>

          {canAssign && (
            <div className="panel px-3.5 py-3">
              <div className="flex items-center justify-between">
                <span className="label">分配 / 改派负责人</span>
                <span className="text-xs text-faint">当前：{lead.assignedUser?.name || lead.assignedUser?.email || "未指派"}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <SearchSelect
                  className="flex-1"
                  value={assignmentTarget}
                  onChange={setAssignmentTarget}
                  loading={assigneesLoading}
                  placeholder="请选择销售负责人"
                  searchPlaceholder="搜索销售姓名…"
                  options={assignees.map((entry) => ({
                    value: entry.id,
                    label: entry.name || entry.email || entry.id,
                    sub: entry.role === "FOREIGN_TRADE" ? "外贸销售" : "销售",
                  }))}
                />
                <button
                  className="btn-brand whitespace-nowrap"
                  disabled={assigning || !assignmentTarget || assignmentTarget === lead.assignedUserId}
                  onClick={() => void assignLead()}
                >
                  {assigning ? <Spinner className="!h-4 !w-4" /> : null}
                  {lead.assignedUserId ? "确认改派" : "确认分配"}
                </button>
              </div>
              {assigneesError && <p className="mt-1.5 text-xs text-bad">{assigneesError}</p>}
              {!assigneesError && !assigneesLoading && assignees.length === 0 && (
                <p className="mt-1.5 text-xs text-faint">暂无可分配的销售或外贸销售账号</p>
              )}
            </div>
          )}

          <div>
            <div className="label mb-2">当前反馈摘要</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
              <Field label="状态">{label(LEAD_REVIEW, lead.reviewStatus)}</Field>
              <Field label="最近反馈人">{lead.reviewedByUser || lead.reviewedByUserId ? userName(lead.reviewedByUser, lead.reviewedByUserId) : <Dash />}</Field>
              <Field label="最近反馈时间">{lead.reviewedAt ? dateTime(lead.reviewedAt) : <Dash />}</Field>
              <Field label="反馈版本"><span className="mono">v{lead.feedbackVersion}</span></Field>
            </div>
          </div>

          <div>
            <div className="label mb-2">反馈历史（{lead.feedbackEvents.length}）</div>
            {lead.feedbackEvents.length === 0 ? (
              <p className="text-xs text-faint py-1">暂无人工反馈记录</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {lead.feedbackEvents.map((event) => (
                  <li key={event.id} className="relative border-l-2 border-line/60 pl-4">
                    <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-brand" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={pillTone(LEAD_REVIEW, event.reviewStatus)}>{label(LEAD_REVIEW, event.reviewStatus)}</Pill>
                      <span className="mono text-[11px] text-faint">{dateTime(event.reviewedAt)}</span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium">
                      {event.reviewReasonCode
                        ? LEAD_FEEDBACK_REASON_LABELS[event.reviewReasonCode as LeadFeedbackReasonCode] || event.reviewReasonCode
                        : "未记录原因"}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-xs text-dim">{event.comment || "无备注"}</p>
                    <p className="mt-1 text-[11px] text-faint">反馈人：{userName(event.reviewedByUser, event.reviewedByUserId)}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="panel px-3.5 py-3">
            <div className="label">提交人工反馈</div>
            <p className="mt-1 text-[11px] text-faint">每次提交都会追加历史事件，不会创建正式客户。</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="label">反馈状态</span>
                <select
                  className="input"
                  value={feedbackStatus}
                  onChange={(event) => {
                    setFeedbackStatus(event.target.value as HumanLeadReviewStatus | "");
                    setFeedbackReason("");
                  }}
                >
                  <option value="">请选择</option>
                  {HUMAN_LEAD_REVIEW_STATUSES.map((status) => (
                    <option key={status} value={status}>{LEAD_FEEDBACK_STATUS_LABELS[status]}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="label">反馈原因</span>
                <select
                  className="input"
                  disabled={!feedbackStatus}
                  value={feedbackReason}
                  onChange={(event) => setFeedbackReason(event.target.value as LeadFeedbackReasonCode | "")}
                >
                  <option value="">请选择</option>
                  {reasons.map((reason) => (
                    <option key={reason} value={reason}>{LEAD_FEEDBACK_REASON_LABELS[reason]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              <span className="label">备注{feedbackReason === "OTHER" ? " *" : "（可选）"}</span>
              <textarea
                className="input min-h-24"
                maxLength={2000}
                placeholder={feedbackReason === "OTHER" ? "选择“其他”原因时必须填写备注" : "补充本次人工判断"}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            </div>
            {feedbackError && <p className="mt-2 text-xs text-bad">{feedbackError}</p>}
            <button
              className="btn-primary mt-3"
              disabled={submitting || !feedbackStatus || !feedbackReason}
              onClick={() => void submitFeedback()}
            >
              {submitting ? <Spinner className="!h-4 !w-4" /> : <Save size={15} />}
              提交反馈（当前 v{lead.feedbackVersion}）
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
