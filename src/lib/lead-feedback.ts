export const HUMAN_LEAD_REVIEW_STATUSES = [
  "HIGH_INTENT",
  "MID_INTENT",
  "LOW_INTENT",
  "INVALID",
] as const;

export type HumanLeadReviewStatus = (typeof HUMAN_LEAD_REVIEW_STATUSES)[number];

export const LEAD_FEEDBACK_REASON_CODES = [
  "MATCHED_HIGH_INTENT",
  "NEEDS_FOLLOWUP",
  "NO_PURCHASE_SIGNAL",
  "INDUSTRY_MISMATCH",
  "NO_CONTACT",
  "DUPLICATE",
  "INVALID_COMPANY",
  "OTHER",
] as const;

export type LeadFeedbackReasonCode = (typeof LEAD_FEEDBACK_REASON_CODES)[number];

export const LEAD_FEEDBACK_STATUS_LABELS: Record<HumanLeadReviewStatus, string> = {
  HIGH_INTENT: "高意向",
  MID_INTENT: "中意向",
  LOW_INTENT: "低意向",
  INVALID: "无效线索",
};

export const LEAD_FEEDBACK_REASON_LABELS: Record<LeadFeedbackReasonCode, string> = {
  MATCHED_HIGH_INTENT: "明确高意向",
  NEEDS_FOLLOWUP: "需要继续跟进",
  NO_PURCHASE_SIGNAL: "暂无采购信号",
  INDUSTRY_MISMATCH: "行业不匹配",
  NO_CONTACT: "无有效联系方式",
  DUPLICATE: "重复线索",
  INVALID_COMPANY: "无效公司",
  OTHER: "其他",
};

const REASONS_BY_STATUS: Record<HumanLeadReviewStatus, readonly LeadFeedbackReasonCode[]> = {
  HIGH_INTENT: ["MATCHED_HIGH_INTENT", "OTHER"],
  MID_INTENT: ["NEEDS_FOLLOWUP", "OTHER"],
  LOW_INTENT: ["NO_PURCHASE_SIGNAL", "OTHER"],
  INVALID: ["INDUSTRY_MISMATCH", "NO_CONTACT", "DUPLICATE", "INVALID_COMPANY", "OTHER"],
};

export function leadFeedbackReasonsForStatus(status: HumanLeadReviewStatus) {
  return REASONS_BY_STATUS[status];
}

export function buildLeadFeedbackPayload(input: {
  reviewStatus: HumanLeadReviewStatus;
  reviewReasonCode: LeadFeedbackReasonCode;
  comment: string;
  expectedFeedbackVersion: number;
}) {
  const comment = input.comment.trim();
  if (!REASONS_BY_STATUS[input.reviewStatus].includes(input.reviewReasonCode)) {
    throw new Error("原因码与反馈状态不匹配");
  }
  if (input.reviewReasonCode === "OTHER" && !comment) throw new Error("OTHER 原因必须填写备注");
  return { ...input, comment: comment || undefined };
}
