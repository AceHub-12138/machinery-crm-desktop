import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { api } from "../lib/api";
import { Empty, ErrorTip, PageHeader, Pill, Spinner, showToast } from "../components/ui";
import {
  DEFAULT_LEAD_HUNTER_CONFIG,
  isLeadHunterCandidateAdmittable,
  selectedLeadHunterCandidateIds,
  validateLeadHunterConfig,
  type LeadHunterDetail,
  type LeadHunterLookupMode,
  type LeadHunterTaskConfig,
  type LeadHunterTaskListItem,
} from "../lib/lead-hunter";

const TASK_LABELS: Record<string, string> = { running: "进行中", done: "已完成", failed: "失败", cancelled: "已取消" };
const CANDIDATE_LABELS: Record<string, string> = {
  PENDING_CONFIRM: "待确认", ADMITTED: "已入池", NO_CONTACT: "无联系方式-待反查", LOOKING_UP: "反查中",
  LOOKUP_FOUND: "反查成功", LOOKUP_FAILED: "反查无果", DISCARDED: "低分归档",
};
const PHASE_LABELS: Record<string, string> = { keywords: "生成关键词", searching: "百度搜索中", scoring: "AI 评分中", lookup: "天眼查反查中", done: "已完成" };

function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="flex flex-col gap-1.5 text-xs text-dim">{label}<input className="input mono" type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export default function LeadHunterView() {
  const [tasks, setTasks] = useState<LeadHunterTaskListItem[] | null>(null);
  const [fakeSearchMode, setFakeSearchMode] = useState(false);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<LeadHunterTaskConfig>({ ...DEFAULT_LEAD_HUNTER_CONFIG });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadHunterDetail | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const detailRequestRef = useRef(0);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ tasks: LeadHunterTaskListItem[]; fakeSearchMode: boolean }>("/api/lead-hunter/tasks");
      setTasks(Array.isArray(result.tasks) ? result.tasks : []);
      setFakeSearchMode(Boolean(result.fakeSearchMode));
      setError("");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (taskId: string, silent = false) => {
    const requestId = ++detailRequestRef.current;
    if (!silent) setDetail(null);
    try {
      const result = await api<LeadHunterDetail>(`/api/lead-hunter/tasks/${taskId}`);
      if (requestId === detailRequestRef.current) {
        setDetail(result);
        if (!silent) setChecked(new Set());
        setError("");
      }
    } catch (reason) {
      if (requestId === detailRequestRef.current) setError((reason as Error).message);
    }
  }, []);

  useEffect(() => () => { detailRequestRef.current += 1; }, []);

  useEffect(() => { void loadTasks(); }, [loadTasks]);
  useEffect(() => {
    if (!selectedId || detail?.task.status !== "running") return;
    const timer = window.setInterval(() => { void loadDetail(selectedId, true); void loadTasks(); }, 3000);
    return () => window.clearInterval(timer);
  }, [detail?.task.status, loadDetail, loadTasks, selectedId]);

  const selectTask = (taskId: string) => { setSelectedId(taskId); void loadDetail(taskId); };

  const createTask = async () => {
    const validationError = validateLeadHunterConfig(form);
    if (validationError) return showToast(validationError, "error");
    setBusy(true);
    try {
      const result = await api<{ id: string }>("/api/lead-hunter/tasks", { method: "POST", body: { ...form, goal: form.goal.trim() } });
      showToast("任务已创建并开始执行", "success");
      setForm({ ...DEFAULT_LEAD_HUNTER_CONFIG });
      await loadTasks();
      selectTask(result.id);
    } catch (reason) {
      showToast((reason as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const cancelTask = async (taskId: string) => {
    setBusy(true);
    try {
      await api(`/api/lead-hunter/tasks/${taskId}/cancel`, { method: "POST" });
      showToast("任务已取消", "success");
      await Promise.all([loadTasks(), selectedId === taskId ? loadDetail(taskId, true) : Promise.resolve()]);
    } catch (reason) {
      showToast((reason as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const rerunTask = async (taskId: string) => {
    setBusy(true);
    try {
      const result = await api<{ id: string }>(`/api/lead-hunter/tasks/${taskId}/rerun`, { method: "POST" });
      showToast("已按原配置重新执行", "success");
      await loadTasks();
      selectTask(result.id);
    } catch (reason) {
      showToast((reason as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const runCandidateAction = async (action: "admit" | "reverse-lookup") => {
    if (!detail) return;
    const candidateIds = selectedLeadHunterCandidateIds(detail.task.candidates, checked, action);
    if (!candidateIds.length) return;
    setBusy(true);
    try {
      const result = await api<any>(`/api/lead-hunter/tasks/${detail.task.id}/${action}`, { method: "POST", body: { candidateIds } });
      if (action === "admit") {
        const assigned = Array.isArray(result.results) ? result.results.filter((item: { assignedUserId?: string | null }) => item.assignedUserId).length : 0;
        showToast(`已入池 ${result.admitted ?? candidateIds.length} 条，其中 ${assigned} 条已自动分配`, "success");
      } else {
        showToast(`反查完成：成功 ${result.found ?? 0} 条、无果 ${result.failed ?? 0} 条`, "success");
      }
      setChecked(new Set());
      await Promise.all([loadDetail(detail.task.id, true), loadTasks()]);
    } catch (reason) {
      showToast((reason as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const filteredTasks = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword ? (tasks || []).filter((task) => task.config.goal.toLowerCase().includes(keyword)) : tasks || [];
  }, [query, tasks]);
  const candidates = detail?.task.candidates || [];
  const checkedForAdmit = selectedLeadHunterCandidateIds(candidates, checked, "admit");
  const checkedForLookup = selectedLeadHunterCandidateIds(candidates, checked, "reverse-lookup");
  const progress = detail?.task.progress;
  const report = detail?.task.report;

  return <div className="flex-1 overflow-y-auto px-6 pb-6">
    <div className="pt-5 pb-4"><PageHeader title="获客助手" sub="AI 关键词 → 百度搜索 → AI 评分 → 人工确认入池"><button className="btn-ghost !px-2.5" onClick={() => void loadTasks()} title="刷新">{loading ? <Spinner className="!h-4 !w-4" /> : <RefreshCw size={15} />}</button></PageHeader></div>
    {error && <div className="mb-4"><ErrorTip message={error} onRetry={() => void loadTasks()} /></div>}

    <section className="panel p-4">
      <h2 className="font-semibold">新建获客任务</h2>
      <label className="mt-3 flex flex-col gap-1.5 text-xs text-dim">目标客户描述<textarea className="input !h-20 resize-none" maxLength={2000} value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value })} placeholder="例：帮我找浙江省做联轴器、键槽加工的厂家" /></label>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <NumberField label="搜索轮数（1-5）" value={form.maxRounds} min={1} max={5} onChange={(value) => setForm({ ...form, maxRounds: value })} />
        <NumberField label="每轮结果条数（1-10）" value={form.pagesPerRound} min={1} max={10} onChange={(value) => setForm({ ...form, pagesPerRound: value })} />
        <NumberField label="关键词迭代轮数（0-3）" value={form.keywordIterations} min={0} max={3} onChange={(value) => setForm({ ...form, keywordIterations: value })} />
        <NumberField label="评分及格线（0-100）" value={form.passingScore} min={0} max={100} onChange={(value) => setForm({ ...form, passingScore: value })} />
        <NumberField label="天眼查每日反查上限（0-200）" value={form.dailyLookupLimit} min={0} max={200} onChange={(value) => setForm({ ...form, dailyLookupLimit: value })} />
        <label className="flex flex-col gap-1.5 text-xs text-dim">反查模式<select className="input" value={form.lookupMode} onChange={(event) => setForm({ ...form, lookupMode: event.target.value as LeadHunterLookupMode })}><option value="MANUAL">人工勾选后反查</option><option value="AUTO">自动反查（按上限）</option></select></label>
      </div>
      <div className="mt-4 flex items-center gap-3"><button className="btn-brand" disabled={busy || Boolean(validateLeadHunterConfig(form))} onClick={() => void createTask()}>创建并开始执行</button><p className="text-xs text-faint">{fakeSearchMode ? "当前为演示假搜索模式，不消耗百度额度。" : "当前为真实搜索模式，会消耗百度搜索额度。"}{form.lookupMode === "AUTO" ? " 自动反查会消耗天眼查额度。" : ""}</p></div>
    </section>

    <section className="panel mt-4 p-4">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">任务列表</h2><div className="relative w-64"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input !pl-8" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="在已加载任务中搜索" /></div></div>
      {loading && !tasks ? <div className="flex justify-center py-10"><Spinner /></div> : filteredTasks.length === 0 ? <Empty text="暂无获客任务" /> : <div className="mt-3 overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr><th className="th">状态</th><th className="th">目标客户描述</th><th className="th">候选 / 入池</th><th className="th">创建时间</th><th className="th">操作</th></tr></thead><tbody>{filteredTasks.map((task) => <tr className="row-hover" key={task.id}><td className="td"><Pill tone={task.status === "failed" ? "text-bad bg-bad/10" : "text-brandhi bg-brand/10"}>{TASK_LABELS[task.status] || task.status}</Pill></td><td className="td max-w-sm"><button className="text-left hover:text-brandhi" onClick={() => selectTask(task.id)}>{task.config.goal}</button>{task.error && <p className="mt-1 text-xs text-bad">{task.error}</p>}</td><td className="td mono">{task._count.candidates} / {task.admittedCount}</td><td className="td text-xs text-faint">{formatTime(task.createdAt)}</td><td className="td"><div className="flex gap-2"><button className="btn-ghost !py-1.5 text-xs" onClick={() => selectTask(task.id)}>详情</button>{task.status === "running" && <button className="btn-ghost !py-1.5 text-xs" disabled={busy} onClick={() => void cancelTask(task.id)}>取消</button>}{["failed", "cancelled"].includes(task.status) && <button className="btn-ghost !py-1.5 text-xs" disabled={busy} onClick={() => void rerunTask(task.id)}>重跑</button>}</div></td></tr>)}</tbody></table></div>}
    </section>

    {selectedId && !detail && !error && <div className="flex justify-center py-10"><Spinner /></div>}
    {detail && <section className="panel mt-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">任务详情</h2><p className="mt-1 text-sm text-dim">{detail.task.config.goal}</p></div><div className="flex items-center gap-2"><Pill tone="text-brandhi bg-brand/10">{TASK_LABELS[detail.task.status] || detail.task.status}</Pill>{detail.task.status === "running" && <button className="btn-ghost !py-1.5 text-xs" disabled={busy} onClick={() => void cancelTask(detail.task.id)}>取消任务</button>}{["failed", "cancelled"].includes(detail.task.status) && <button className="btn-ghost !py-1.5 text-xs" disabled={busy} onClick={() => void rerunTask(detail.task.id)}>重新执行</button>}</div></div>
      {detail.task.error && <div className="mt-3 rounded-lg border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">{detail.task.error}</div>}
      <div className="panel mt-3 px-3 py-3 text-sm text-dim">{detail.task.status === "running" ? `第 ${progress?.currentRound ?? 0} / ${progress?.totalRounds ?? detail.task.config.maxRounds} 轮 · ${PHASE_LABELS[progress?.phase || ""] || "准备中"}` : `共 ${progress?.roundSummaries.length ?? 0} 轮`}{progress?.currentKeywords?.length ? <p className="mt-1 text-xs text-faint">当前关键词：{progress.currentKeywords.join("、")}</p> : null}</div>
      <div className="mt-4 flex flex-wrap gap-2"><button className="btn-ghost text-xs" disabled={busy || !checkedForLookup.length} onClick={() => void runCandidateAction("reverse-lookup")}>反查电话（{checkedForLookup.length}）</button><button className="btn-brand text-xs" disabled={busy || !checkedForAdmit.length} onClick={() => void runCandidateAction("admit")}>入池（{checkedForAdmit.length}）</button><button className="btn-ghost text-xs" onClick={() => setChecked(new Set(candidates.filter((candidate) => isLeadHunterCandidateAdmittable(candidate.status)).slice(0, 50).map((candidate) => candidate.id)))}>全选可入池（最多 50 条）</button><button className="btn-ghost text-xs" onClick={() => setChecked(new Set())}>取消勾选</button></div>
      {candidates.length === 0 ? <Empty text={detail.task.status === "running" ? "正在搜索，候选会实时出现" : "该任务没有产出候选"} /> : <div className="mt-3 overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr><th className="th w-8"></th><th className="th">公司</th><th className="th">评分</th><th className="th">评分理由</th><th className="th">电话</th><th className="th">省市</th><th className="th">状态</th><th className="th">轮次</th></tr></thead><tbody>{candidates.map((candidate) => <tr className="row-hover align-top" key={candidate.id}><td className="td"><input type="checkbox" disabled={!isLeadHunterCandidateAdmittable(candidate.status) || (!checked.has(candidate.id) && checked.size >= 50)} checked={checked.has(candidate.id)} onChange={() => setChecked((current) => { const next = new Set(current); if (next.has(candidate.id)) next.delete(candidate.id); else if (next.size < 50) next.add(candidate.id); return next; })} /></td><td className="td font-medium">{candidate.sourceUrl ? <button className="inline-flex items-center gap-1 text-left hover:text-brandhi" onClick={() => void window.dachuan.openExternal(candidate.sourceUrl!)}>{candidate.companyName}<ExternalLink size={12} /></button> : candidate.companyName}</td><td className="td mono">{candidate.score ?? "—"}</td><td className="td max-w-xs text-xs text-dim">{candidate.scoreReason || "—"}</td><td className="td mono">{candidate.phone || "—"}</td><td className="td">{[candidate.province, candidate.city].filter(Boolean).join(" ") || "—"}</td><td className="td"><Pill tone="text-dim bg-steel/25">{CANDIDATE_LABELS[candidate.status] || candidate.status}</Pill></td><td className="td">{candidate.round ?? "—"}</td></tr>)}</tbody></table></div>}
      <div className="mt-4 grid grid-cols-4 gap-3 rounded-xl bg-panel2 px-3 py-3 text-sm text-dim"><p>候选总数：<b>{report?.totalCandidates ?? candidates.length}</b></p><p>已入池：<b>{detail.stats.ADMITTED ?? 0}</b></p><p>低分归档：<b>{report?.discarded ?? detail.stats.DISCARDED ?? 0}</b></p><p>天眼查调用：<b>{report?.lookupCalls ?? 0}</b></p></div>
    </section>}
  </div>;
}
