// MD 剥离器单测：AI 输出必须呈纯文本对话风格（无 *、|----|、##、---- 空行、| 分割等）。
import { test } from "node:test";
import assert from "node:assert/strict";

import { stripMarkdown } from "../src/lib/md-stripper.ts";

test("标题/加粗/斜体/删除线/行内代码 → 纯文本", () => {
  const out = stripMarkdown("## 季度报告\n响应：**增长 12%**，其中 `内销` 占比 *约六成*，~~预估~~ 实测。");
  assert.equal(out, ["季度报告", "响应：增长 12%，其中 内销 占比 约六成，预估 实测。"].join("\n"));
  assert.ok(!/[#*~`]/.test(out), "不允许残留任何 MD 符号");
});

test("表格 → 单行「，」连接（不出现 |----| 或单元格式竖线）", () => {
  const md = [
    "| 合同 | 客户 | 金额 |",
    "| --- | --- | --- |",
    "| DC-001 | 济南德鑫 | 70万 |",
    "| DC-002 | 常州弘精 | 98万 |",
  ].join("\n");
  const out = stripMarkdown(md);
  assert.equal(out, ["合同，客户，金额", "DC-001，济南德鑫，70万", "DC-002，常州弘精，98万"].join("\n"));
  assert.ok(!out.includes("|"), "不允许残留表格竖线");
});

test("水平线（---/***）与 MD 空行折叠", () => {
  const md = "第一段\n\n\n---\n\n\n第二段\n\n***\n\n第三段";
  const out = stripMarkdown(md);
  assert.equal(out, ["第一段", "", "第二段", "", "第三段"].join("\n"));
  assert.ok(!/^[-*]{3,}$/m.test(out), "不允许残留水平线");
});

test("列表记号与序号 → 对话式前缀", () => {
  const out = stripMarkdown("建议：\n- 先查库存\n* 再下推工单\n+ 通知仓库\n1. 第一步\n2. 第二步");
  assert.equal(out, ["建议：", "· 先查库存", "· 再下推工单", "· 通知仓库", "1. 第一步", "2. 第二步"].join("\n"));
});

test("引用块去 > 前缀；链接保留文字与地址", () => {
  const out = stripMarkdown("> 引用：以官网为准\n参考 [大川官网](https://dachuan.pro) 与 [内部手册](/docs/handbook.pdf)");
  assert.equal(out, ["引用：以官网为准", "参考 大川官网（https://dachuan.pro） 与 内部手册"].join("\n"));
  assert.ok(!out.includes(">"));
  assert.ok(!out.includes("["));
});

test("代码围栏：围栏行丢弃，内容原样保留", () => {
  const out = stripMarkdown("计算如下：\n```python\nx = a * b ** 2  # 幂\nprint(x)\n```\n结论如上");
  assert.ok(out.includes("x = a * b ** 2"), "代码内容必须原样（虽是 * 号也是代码语义，不误伤）");
  assert.ok(!out.includes("```"));
});

test("幂等性：剥离两次结果一致（流式分批处理安全）", () => {
  const md = "### 标题\n| A | B |\n| -- | -- |\n| 1 | 2 |\n\n---\n- 列表 **粗**";
  const once = stripMarkdown(md);
  const twice = stripMarkdown(once);
  assert.equal(once, twice);
});

test("无 MD 的普通文本原样通过（不被破坏）", () => {
  const plain = "今天有三家客户待跟进，其中济南德鑫是 A 级重点。报价单已发。";
  assert.equal(stripMarkdown(plain), plain);
});

test("误伤护栏：乘号/版本号/通配不上当", () => {
  const out = stripMarkdown("3 * 4 = 12，型号 BK50*30，下划线 a_b 不变");
  assert.ok(out.includes("3 * 4 = 12"), "数学乘号必须保留");
  assert.ok(out.includes("BK50*30"), "型号中的星号保留");
  assert.ok(out.includes("a_b"), "普通下划线保留");
});
