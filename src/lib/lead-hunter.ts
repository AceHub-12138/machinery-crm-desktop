export type LeadHunterLookupMode = "MANUAL" | "AUTO";

export interface LeadHunterTaskConfig {
  goal: string;
  maxRounds: number;
  pagesPerRound: number;
  keywordIterations: number;
  passingScore: number;
  dailyLookupLimit: number;
  lookupMode: LeadHunterLookupMode;
}

export interface LeadHunterTaskProgress {
  currentRound: number;
  totalRounds: number;
  phase: string;
  currentKeywords: string[];
  roundSummaries: Array<{
    round: number;
    keywords: string[];
    candidates: number;
    qualified: number;
    parseFailed: number;
  }>;
}

export interface LeadHunterTaskReport {
  totalCandidates: number;
  admitted: number;
  discarded: number;
  lookupCalls: number;
  startedAt?: string;
  finishedAt: string | null;
}

export interface LeadHunterCandidate {
  id: string;
  companyName: string;
  sourceUrl: string | null;
  score: number | null;
  scoreReason: string | null;
  phone: string | null;
  email: string | null;
  province: string | null;
  city: string | null;
  round: number | null;
  status: string;
  leadId: string | null;
}

export interface LeadHunterTaskListItem {
  id: string;
  status: string;
  config: LeadHunterTaskConfig;
  progress: LeadHunterTaskProgress | null;
  report: LeadHunterTaskReport | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { candidates: number };
  admittedCount: number;
}

export interface LeadHunterDetail {
  task: LeadHunterTaskListItem & { candidates: LeadHunterCandidate[] };
  stats: Record<string, number>;
}

export const DEFAULT_LEAD_HUNTER_CONFIG: LeadHunterTaskConfig = {
  goal: "",
  maxRounds: 3,
  pagesPerRound: 3,
  keywordIterations: 2,
  passingScore: 70,
  dailyLookupLimit: 20,
  lookupMode: "MANUAL",
};

function outsideIntegerRange(value: number, min: number, max: number) {
  return !Number.isInteger(value) || value < min || value > max;
}

export function validateLeadHunterConfig(config: LeadHunterTaskConfig): string | null {
  const goalLength = config.goal.trim().length;
  if (goalLength < 5) return "目标客户描述至少 5 个字";
  if (goalLength > 2000) return "目标客户描述不能超过 2000 个字";
  if (outsideIntegerRange(config.maxRounds, 1, 5)) return "搜索轮数必须在 1 到 5 之间";
  if (outsideIntegerRange(config.pagesPerRound, 1, 10)) return "每轮结果条数必须在 1 到 10 之间";
  if (outsideIntegerRange(config.keywordIterations, 0, 3)) return "关键词迭代轮数必须在 0 到 3 之间";
  if (outsideIntegerRange(config.passingScore, 0, 100)) return "评分及格线必须在 0 到 100 之间";
  if (outsideIntegerRange(config.dailyLookupLimit, 0, 200)) return "每日反查上限必须在 0 到 200 之间";
  if (config.lookupMode !== "MANUAL" && config.lookupMode !== "AUTO") return "反查模式无效";
  return null;
}

const ADMITTABLE_CANDIDATE_STATUSES = new Set(["PENDING_CONFIRM", "NO_CONTACT", "LOOKUP_FOUND", "LOOKUP_FAILED"]);

export function selectedLeadHunterCandidateIds(
  candidates: ReadonlyArray<{ id: string; status: string }>,
  checkedIds: ReadonlySet<string>,
  action: "admit" | "reverse-lookup",
): string[] {
  return candidates
    .filter((candidate) => checkedIds.has(candidate.id))
    .filter((candidate) => action === "admit"
      ? ADMITTABLE_CANDIDATE_STATUSES.has(candidate.status)
      : candidate.status === "NO_CONTACT")
    .map((candidate) => candidate.id)
    .slice(0, 50);
}

export function isLeadHunterCandidateAdmittable(status: string): boolean {
  return ADMITTABLE_CANDIDATE_STATUSES.has(status);
}
