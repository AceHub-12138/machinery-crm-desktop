import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildConfigFromForm,
  buildShareUrl,
  DEFAULT_SALES_SCREEN_CONFIG,
  findSalesScreenSetting,
  formFromConfig,
  normalizeSalesScreenConfig,
  ROTATE_CONFIRM_COPY,
  REVOKE_CONFIRM_COPY,
  COPY_FAIL_NOTICE,
  COPY_OK_NOTICE,
  SAVE_OK_NOTICE,
  PUBLIC_DATA_NOTICE,
  SALES_SCREEN_SETTING_KEY,
  validateSalesScreenConfigForm,
} from "../src/lib/sales-screen.ts";

test("缺失或损坏的配置回退到与 Web 一致的安全默认值", () => {
  assert.deepEqual(normalizeSalesScreenConfig(undefined), DEFAULT_SALES_SCREEN_CONFIG);
  assert.equal(DEFAULT_SALES_SCREEN_CONFIG.enabled, false);
  assert.deepEqual(DEFAULT_SALES_SCREEN_CONFIG.multipliers, {
    amount: 1,
    customerCount: 1,
    contractCount: 1,
    shipmentCount: 1,
  });
  assert.deepEqual(DEFAULT_SALES_SCREEN_CONFIG.privacy, {
    contractNumberMode: "masked",
    addressLevel: "provinceCity",
    showDisplayNotice: true,
  });
  const repaired = normalizeSalesScreenConfig({
    version: 1,
    enabled: true,
    modules: { operatingKpis: true, deliveryMap: true, collection: true, deliveryAlerts: true, deliveryMilestones: true },
    multipliers: { amount: 0, customerCount: "5", contractCount: 1.5, shipmentCount: 1 },
    privacy: { contractNumberMode: "other" },
  });
  assert.deepEqual(repaired.multipliers, DEFAULT_SALES_SCREEN_CONFIG.multipliers);
  assert.equal(repaired.privacy.contractNumberMode, "masked");
});

test("五板块全关时归一化恢复安全状态，倍率必须是 1～100 整数", () => {
  const allOff = normalizeSalesScreenConfig({
    version: 1,
    enabled: true,
    modules: { operatingKpis: false, deliveryMap: false, collection: false, deliveryAlerts: false, deliveryMilestones: false },
    multipliers: { amount: 5, customerCount: 1, contractCount: 1, shipmentCount: 1 },
    privacy: {},
  });
  assert.deepEqual(allOff.modules, DEFAULT_SALES_SCREEN_CONFIG.modules);
});

test("findSalesScreenSetting 从 settings 列表读取 salesScreen 行，缺失用默认值", () => {
  assert.deepEqual(findSalesScreenSetting([]), DEFAULT_SALES_SCREEN_CONFIG);
  assert.deepEqual(findSalesScreenSetting(undefined), DEFAULT_SALES_SCREEN_CONFIG);
  const stored = { ...DEFAULT_SALES_SCREEN_CONFIG, enabled: true };
  assert.deepEqual(
    findSalesScreenSetting([{ key: "reminders", value: {} }, { key: SALES_SCREEN_SETTING_KEY, value: stored }]),
    stored,
  );
  assert.equal(SALES_SCREEN_SETTING_KEY, "salesScreen");
});

test("表单校验与 Web 同文案：全关与非法倍率", () => {
  const form = formFromConfig(DEFAULT_SALES_SCREEN_CONFIG);
  for (const key of Object.keys(form.modules)) {
    form.modules[key] = false;
  }
  assert.equal(validateSalesScreenConfigForm(form), "至少需要启用一个板块");
  const bad = formFromConfig(DEFAULT_SALES_SCREEN_CONFIG);
  for (const value of ["0", "101", "1.5", "abc", ""]) {
    bad.multiplierText.amount = value;
    assert.equal(validateSalesScreenConfigForm(bad), "倍率必须是 1～100 的整数");
  }
  assert.equal(validateSalesScreenConfigForm(formFromConfig(DEFAULT_SALES_SCREEN_CONFIG)), null);
});

test("buildConfigFromForm 把倍率文本解析为整数配置", () => {
  const form = formFromConfig(DEFAULT_SALES_SCREEN_CONFIG);
  form.multiplierText.shipmentCount = " 7 ";
  const parsed = buildConfigFromForm(form);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.config.multipliers.shipmentCount, 7);
  const invalid = formFromConfig(DEFAULT_SALES_SCREEN_CONFIG);
  invalid.multiplierText.customerCount = "200";
  const failed = buildConfigFromForm(invalid);
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.equal(failed.error, "倍率必须是 1～100 的整数");
});

test("共享链接用当前服务器 origin 拼接相对路径", () => {
  assert.equal(buildShareUrl("https://dachuan.pro", "/screen/sales/abc?kiosk=1"), "https://dachuan.pro/screen/sales/abc?kiosk=1");
  assert.equal(buildShareUrl("https://dachuan.pro/", "/screen/sales/abc?kiosk=1"), "https://dachuan.pro/screen/sales/abc?kiosk=1");
  assert.equal(buildShareUrl("http://localhost:3000", "screen/sales/abc"), "http://localhost:3000/screen/sales/abc");
});

test("UI 文案与 Web 第 6 步逐字一致", () => {
  assert.equal(PUBLIC_DATA_NOTICE, "仅改变公开大屏显示，不修改 CRM/ERP 真实数据。");
  assert.equal(SAVE_OK_NOTICE, "已保存，公开大屏将在下次刷新时生效");
  assert.equal(COPY_OK_NOTICE, "已复制链接，可粘贴到大屏电脑浏览器打开");
  assert.equal(COPY_FAIL_NOTICE, "复制失败，请手动复制链接");
  assert.equal(ROTATE_CONFIRM_COPY.title, "重新生成共享链接");
  assert.equal(ROTATE_CONFIRM_COPY.confirmText, "重新生成");
  // Web 端对 rotate/revoke 都启用危险样式：两个确认都必须是红色 danger
  assert.equal(ROTATE_CONFIRM_COPY.danger, true);
  assert.match(ROTATE_CONFIRM_COPY.message, /旧链接将立即失效/);
  assert.equal(REVOKE_CONFIRM_COPY.title, "撤销共享链接");
  assert.equal(REVOKE_CONFIRM_COPY.confirmText, "撤销链接");
  assert.equal(REVOKE_CONFIRM_COPY.danger, true);
  assert.match(REVOKE_CONFIRM_COPY.message, /立即失效/);
  assert.match(REVOKE_CONFIRM_COPY.message, /大屏不可用/);
});
