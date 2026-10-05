// 单元测试：核心纯逻辑（SSE 解码 / 头像路径映射 / 跟进提醒分组 / 导航映射 / 区域数据）。
// Node 22 原生 --experimental-strip-types 直接导入 .ts 源文件；tsx 组件不在测试范围。
import { test } from "node:test";
import assert from "node:assert/strict";

import { SSEParser } from "../electron/sse-parser.ts";
import { toFetchableUploadPath, isProtectedUploadPath } from "../src/lib/attachments.ts";
import { groupFollowUpCustomers, overdueDays } from "../src/lib/reminders.ts";
import { canAccessView, defaultViewForRole, parseHref } from "../src/lib/navigation.ts";
import { PROVINCE_CITY_MAP, PROVINCE_OPTIONS, sanitizeTerritories } from "../src/lib/region-data.ts";

// ---------- SSE：跨分片的多字节 UTF-8（中文）与事件切分 ----------

test("SSE 中文在分片边界不乱码（stream:true 增量解码）", () => {
  const parser = new SSEParser();
  // "今天晴" UTF-8 共 9 字节，人为切成 4+5 模拟网络分片且劈开"天"字
  const bytes = new TextEncoder().encode('data: {"type":"delta","text":"今天晴"}\n\n');
  const first = parser.feed(bytes.slice(0, 4));
  assert.deepEqual(first, [], "首片不成帧，不应输出事件");
  const second = parser.feed(bytes.slice(4));
  assert.equal(second.length, 1);
  const event = JSON.parse(second[0]);
  assert.equal(event.text, "今天晴", "跨分片中文字符必须完整解码，不能出现 U+FFFD �");
});

test("SSE 循环边界：分片切在 NLNL 处也能成帧", () => {
  const parser = new SSEParser();
  const first = new TextEncoder().encode('data: {"a":1}\n');
  const second = new TextEncoder().encode('\ndata: {"a":2}\n\n');
  assert.deepEqual(parser.feed(first), []);
  assert.deepEqual(parser.feed(second), ['{"a":1}', '{"a":2}']);
});

test("SSE flush：流尾帧内数据在结束时输出", () => {
  const parser = new SSEParser();
  parser.feed(new TextEncoder().encode('data: {"tail":true}\n\n'));
  parser.feed(new TextEncoder().encode('data: {"incomplete":false}'));
  assert.deepEqual(parser.flush(), ['{"incomplete":false}'], "未成帧的残留事件应在 flush 输出");
  assert.deepEqual(parser.flush(), [], "flush 后无残留");
});

// ---------- 头像：受保护上传资源路径映射 ----------

test("头像路径映射：/uploads → /api/uploads（带鉴权代理），其余原样", () => {
  assert.equal(toFetchableUploadPath("/uploads/avatars/x.png"), "/api/uploads/avatars/x.png");
  assert.equal(toFetchableUploadPath("/api/uploads/avatars/x.png"), "/api/uploads/avatars/x.png");
  assert.equal(toFetchableUploadPath("https://cdn.example.com/a.png"), "https://cdn.example.com/a.png");
  assert.equal(isProtectedUploadPath("/uploads/avatars/x.png"), true);
  assert.equal(isProtectedUploadPath("/api/uploads/avatars/x.png"), true);
  assert.equal(isProtectedUploadPath("https://cdn.example.com/a.png"), false);
  assert.equal(isProtectedUploadPath(""), false);
});

// ---------- 跟进提醒：按平台客户数组契约分组 ----------

test("提醒分组：今日 / 7 天内到期 / 逾期 三桶（窗口对齐 API 的 lte today+7）", () => {
  const now = new Date("2026-09-09T10:00:00");
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  // 以本地日历天构造时间戳，避免测试依赖运行机器时区
  const at = (offsetDays, hour = 10) => {
    const d = new Date(startOfToday);
    d.setDate(d.getDate() + offsetDays);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const mk = (id, nextFollowDate) => ({ id, companyName: `公司${id}`, nextFollowDate });
  const buckets = groupFollowUpCustomers(
    [
      mk("overdue", at(-3)),
      mk("today", at(0, 9)),
      mk("today-late", at(0, 23)),
      mk("tomorrow", at(1)),
      mk("day-six", at(6)),
      mk("window-end", at(7, 0)), // 今天 +7 天 0 点：平台 lte 的闭区间右界，必须进 upcoming
      mk("day-seven-after", at(7, 8)), // 第 7 天 0 点之后：平台 lte 不返回，桌面也不应计入
      mk("day-eight", at(8)),
      { id: "no-date", companyName: "无日期" },
      { id: "bad-date", companyName: "坏日期", nextFollowDate: "not-a-date" },
    ],
    now
  );
  assert.deepEqual(buckets.today.map((c) => c.id), ["today", "today-late"]);
  // 修复前 day-six / window-end 会被 6*day 的旧边界丢弃；现在必须完整接住
  assert.deepEqual(buckets.upcoming.map((c) => c.id), ["tomorrow", "day-six", "window-end"]);
  assert.deepEqual(buckets.overdue.map((c) => c.id), ["overdue"]);
  const all = [...buckets.today, ...buckets.upcoming, ...buckets.overdue].map((c) => c.id);
  // 三桶并集 = API（nextFollowDate <= today+7）返回的集合，不重不漏
  for (const id of ["overdue", "today", "today-late", "tomorrow", "day-six", "window-end"]) {
    assert.equal(all.includes(id), true, `${id} 应被某个桶接住`);
  }
  for (const id of ["day-seven-after", "day-eight", "no-date", "bad-date"]) {
    assert.equal(all.includes(id), false, `${id} 不应计入任何桶`);
  }
  assert.equal(new Set(all).size, all.length, "同一客户不得重复入桶");
});

test("提醒分组：非数组（旧客户端误用的 {today,overdue} 形状）按空处理", () => {
  const bad = groupFollowUpCustomers({ today: [1], overdue: [2] });
  assert.deepEqual(bad, { today: [], upcoming: [], overdue: [] });
  assert.deepEqual(groupFollowUpCustomers(null), { today: [], upcoming: [], overdue: [] });
});

test("逾期天数：至少 1 天起算，无日期/坏日期为 0", () => {
  const now = new Date("2026-09-09T15:00:00");
  assert.equal(overdueDays("2026-09-09T01:00:00+08:00", now), 1, "今天已过的按 1 天计");
  assert.equal(overdueDays("2026-09-05T09:00:00+08:00", now), 4);
  assert.equal(overdueDays(null, now), 0);
  assert.equal(overdueDays("not-a-date", now), 0);
});

// ---------- 导航：平台 href → 桌面视图 ----------

test("导航映射：平台任务/提醒的 href 解析为视图与客户定位", () => {
  assert.deepEqual(parseHref("/customers/abc123"), { view: "customers", params: { customerId: "abc123" } });
  assert.deepEqual(parseHref("/shipments"), { view: "shipments", params: undefined });
  assert.deepEqual(parseHref("/shipments?alertOnly=1"), { view: "shipments", params: { alertOnly: "1" } });
  assert.deepEqual(parseHref("/shipments?status=OVERDUE"), { view: "shipments", params: { status: "OVERDUE" } });
  assert.deepEqual(parseHref("/lead-hunter"), { view: "lead-hunter", params: undefined });
  assert.deepEqual(parseHref("/dashboard/crm"), { view: "dashboard", params: undefined });
  assert.deepEqual(parseHref("/xiaochuan"), { view: "chat", params: undefined });
  assert.deepEqual(parseHref("/tasks/monthly?month=2026-09"), { view: "tasks", params: { mode: "monthly", month: "2026-09" } });
  assert.deepEqual(parseHref("/contract-unlock-requests"), { view: "contract-unlock-requests", params: undefined });
  assert.equal(parseHref("/erp/production-orders"), null, "ERP 页面桌面端不存在，应无法映射");
  assert.equal(parseHref(undefined), null);
  assert.equal(parseHref("/unknown"), null);
  assert.equal(parseHref("/customers/%E0%A4%A"), null, "畸形编码深链应安全拒绝而不是抛错");
});

// 工作台发货提醒行 → /contracts/{id}、售后提醒行 → /after-sales/{id}（与平台网页端 href 相同）
test("导航映射：单条深链解析出合同 / 售后工单定位", () => {
  assert.deepEqual(parseHref("/contracts/contract-9"), { view: "contracts", params: { contractId: "contract-9" } });
  assert.deepEqual(parseHref("/after-sales/order-7"), { view: "aftersales", params: { afterSalesId: "order-7" } });
  // 单条深链只带 id（与 /customers/:id 一致），列表页本身仍走普通路由的 query 透传
  assert.deepEqual(parseHref("/contracts/contract-9?tab=unpaid"), { view: "contracts", params: { contractId: "contract-9" } });
  // 列表页本身仍走普通路由，不能被单条深链规则吃掉
  assert.deepEqual(parseHref("/contracts"), { view: "contracts", params: undefined });
  assert.deepEqual(parseHref("/after-sales?reminder=in-progress"), { view: "aftersales", params: { reminder: "in-progress" } });
  assert.deepEqual(parseHref("/contracts/"), { view: "contracts", params: undefined }, "末尾斜杠归一化成列表路由，不当成详情");
});

test("页面权限：Lead Hunter 仅超管，ERP 岗位只进入桌面端公共工作区", () => {
  assert.equal(canAccessView("lead-hunter", "SUPER_ADMIN"), true);
  assert.equal(canAccessView("lead-hunter", "SALES"), false);
  assert.equal(canAccessView("users", "FOREIGN_TRADE"), false);
  assert.equal(canAccessView("customers", "WAREHOUSE"), false);
  assert.equal(canAccessView("tasks", "WAREHOUSE"), true);
  assert.equal(canAccessView("chat", "PURCHASE"), true);
  assert.equal(canAccessView("settings", "PURCHASE"), true);
  assert.equal(canAccessView("erp-dashboard", "WAREHOUSE"), true);
  assert.equal(canAccessView("erp-dashboard", "PURCHASE"), true);
  assert.equal(canAccessView("erp-dashboard", "SALES"), false);
  // 采购/仓库登录直达 ERP 工作台（对齐平台 /dashboard/erp）
  assert.equal(defaultViewForRole("WAREHOUSE"), "erp-dashboard");
  assert.equal(defaultViewForRole("PURCHASE"), "erp-dashboard");
  assert.equal(defaultViewForRole("SALES"), "dashboard");
});

// ---------- 区域数据：完整性与清洗 ----------

test("区域数据：全国省份完整且城市为地级市全集（抽查山东 16 市）", () => {
  assert.equal(PROVINCE_OPTIONS.length, 32, "31 省级单位 + 国外");
  assert.equal(PROVINCE_CITY_MAP["山东省"].length, 16, "山东 16 地级市（旧版只有 5 个的 bug 已并入 region-data）");
  assert.equal(PROVINCE_CITY_MAP["河北省"].length, 11);
  assert.ok(PROVINCE_CITY_MAP["山东省"].includes("菏泽市"));
  assert.ok(PROVINCE_CITY_MAP["江苏省"].includes("宿迁市"));
  assert.equal(PROVINCE_CITY_MAP["北京市"].length, 0, "直辖市按整市处理");
  assert.equal(PROVINCE_CITY_MAP["国外"].length, 0);
});

test("sanitizeTerritories：剔除非法省份/城市，字符串 JSON 也能清洗", () => {
  const cleaned = sanitizeTerritories(
    JSON.stringify([
      { province: "山东省", cities: ["济南市", "菏泽市", "不存在的市"] },
      { province: "不存在省", cities: ["x"] },
      { province: "上海市" },
    ])
  );
  assert.deepEqual(cleaned, [
    { province: "山东省", cities: ["济南市", "菏泽市"] },
    { province: "上海市", cities: [] },
  ]);
  assert.deepEqual(sanitizeTerritories("bad-json"), []);
  assert.deepEqual(sanitizeTerritories(null), []);
});
