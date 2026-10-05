import { test } from "node:test";
import assert from "node:assert/strict";

import { buildLeadFeedbackPayload, HUMAN_LEAD_REVIEW_STATUSES, leadFeedbackReasonsForStatus } from "../src/lib/lead-feedback.ts";

test("人工反馈状态不允许提交 PENDING", () => {
  assert.deepEqual(HUMAN_LEAD_REVIEW_STATUSES, ["HIGH_INTENT", "MID_INTENT", "LOW_INTENT", "INVALID"]);
  assert.equal(HUMAN_LEAD_REVIEW_STATUSES.includes("PENDING"), false);
});

test("OTHER 原因必须填写备注", () => {
  assert.throws(
    () => buildLeadFeedbackPayload({ reviewStatus: "HIGH_INTENT", reviewReasonCode: "OTHER", comment: "  ", expectedFeedbackVersion: 2 }),
    /OTHER 原因必须填写备注/,
  );
});

test("反馈原因随意向状态联动", () => {
  assert.deepEqual(leadFeedbackReasonsForStatus("HIGH_INTENT"), ["MATCHED_HIGH_INTENT", "OTHER"]);
  assert.deepEqual(leadFeedbackReasonsForStatus("MID_INTENT"), ["NEEDS_FOLLOWUP", "OTHER"]);
  assert.deepEqual(leadFeedbackReasonsForStatus("LOW_INTENT"), ["NO_PURCHASE_SIGNAL", "OTHER"]);
  assert.deepEqual(leadFeedbackReasonsForStatus("INVALID"), ["INDUSTRY_MISMATCH", "NO_CONTACT", "DUPLICATE", "INVALID_COMPANY", "OTHER"]);
});

test("反馈提交体携带当前版本并清理备注", () => {
  assert.deepEqual(
    buildLeadFeedbackPayload({ reviewStatus: "MID_INTENT", reviewReasonCode: "NEEDS_FOLLOWUP", comment: "  下周联系  ", expectedFeedbackVersion: 7 }),
    { reviewStatus: "MID_INTENT", reviewReasonCode: "NEEDS_FOLLOWUP", comment: "下周联系", expectedFeedbackVersion: 7 },
  );
});

test("反馈原因不能跨状态提交", () => {
  assert.throws(
    () => buildLeadFeedbackPayload({ reviewStatus: "INVALID", reviewReasonCode: "MATCHED_HIGH_INTENT", comment: "", expectedFeedbackVersion: 1 }),
    /原因码与反馈状态不匹配/,
  );
});
