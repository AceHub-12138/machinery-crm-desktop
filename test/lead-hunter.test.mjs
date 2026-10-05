import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LEAD_HUNTER_CONFIG,
  selectedLeadHunterCandidateIds,
  validateLeadHunterConfig,
} from "../src/lib/lead-hunter.ts";

test("Lead Hunter 创建参数与平台约束一致", () => {
  assert.equal(validateLeadHunterConfig(DEFAULT_LEAD_HUNTER_CONFIG), "目标客户描述至少 5 个字");
  assert.equal(validateLeadHunterConfig({ ...DEFAULT_LEAD_HUNTER_CONFIG, goal: "寻找山东机床客户" }), null);
  assert.equal(validateLeadHunterConfig({ ...DEFAULT_LEAD_HUNTER_CONFIG, goal: "寻找山东机床客户", maxRounds: 6 }), "搜索轮数必须在 1 到 5 之间");
  assert.equal(validateLeadHunterConfig({ ...DEFAULT_LEAD_HUNTER_CONFIG, goal: "寻找山东机床客户", pagesPerRound: 0 }), "每轮结果条数必须在 1 到 10 之间");
  assert.equal(validateLeadHunterConfig({ ...DEFAULT_LEAD_HUNTER_CONFIG, goal: "寻找山东机床客户", keywordIterations: 4 }), "关键词迭代轮数必须在 0 到 3 之间");
  assert.equal(validateLeadHunterConfig({ ...DEFAULT_LEAD_HUNTER_CONFIG, goal: "寻找山东机床客户", passingScore: 101 }), "评分及格线必须在 0 到 100 之间");
  assert.equal(validateLeadHunterConfig({ ...DEFAULT_LEAD_HUNTER_CONFIG, goal: "寻找山东机床客户", dailyLookupLimit: 201 }), "每日反查上限必须在 0 到 200 之间");
});

test("Lead Hunter 勾选规则与平台入池和反查状态一致", () => {
  const candidates = [
    { id: "pending", status: "PENDING_CONFIRM" },
    { id: "no-contact", status: "NO_CONTACT" },
    { id: "found", status: "LOOKUP_FOUND" },
    { id: "failed", status: "LOOKUP_FAILED" },
    { id: "admitted", status: "ADMITTED" },
    { id: "discarded", status: "DISCARDED" },
  ];
  const checked = new Set(candidates.map((candidate) => candidate.id));
  assert.deepEqual(selectedLeadHunterCandidateIds(candidates, checked, "admit"), ["pending", "no-contact", "found", "failed"]);
  assert.deepEqual(selectedLeadHunterCandidateIds(candidates, checked, "reverse-lookup"), ["no-contact"]);
});

test("Lead Hunter 单次操作最多提交平台允许的 50 条候选", () => {
  const candidates = Array.from({ length: 60 }, (_, index) => ({ id: `candidate-${index + 1}`, status: "PENDING_CONFIRM" }));
  const ids = selectedLeadHunterCandidateIds(candidates, new Set(candidates.map((candidate) => candidate.id)), "admit");
  assert.equal(ids.length, 50);
  assert.equal(ids[49], "candidate-50");
});
