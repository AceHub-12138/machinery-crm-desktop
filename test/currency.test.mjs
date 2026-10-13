import test from "node:test";
import assert from "node:assert/strict";
import { formatMoney, formatPriceSnapshot, sumByCurrency, currencyLines, dashboardAmounts, contractPaymentLabel } from "../src/lib/currency.ts";
const records = [
  { currency: "CNY", amount: "50000.00", paidAmount: "20000.00" },
  { currency: "CNY", amount: "60000.00", paidAmount: "30000.00" },
  { currency: "CNY", amount: "75500.00", paidAmount: "25000.00" },
  { currency: "EUR", amount: "25600.00", paidAmount: "5600.00" },
];
test("three CNY contracts and one EUR contract never mix", () => {
  assert.deepEqual(sumByCurrency(records), [{ currency: "CNY", amount: "185500.00" }, { currency: "EUR", amount: "25600.00" }]);
  assert.deepEqual(sumByCurrency(records, "paidAmount"), [{ currency: "CNY", amount: "75000.00" }, { currency: "EUR", amount: "5600.00" }]);
});
test("formatting follows CNY EUR and other currency codes", () => {
  assert.deepEqual(formatMoney(185500, "CNY"), "¥185,500");
  assert.deepEqual(formatMoney(25600, "EUR"), "€25,600");
  assert.deepEqual(formatMoney(25000.5, "USD"), "USD 25,000.5");
  assert.deepEqual(formatMoney(null, "EUR"), "-");
  assert.deepEqual(formatMoney("NaN", "EUR"), "-");
  assert.deepEqual(formatMoney(-2.55, "EUR"), "€-2.55");
});
test("legacy missing fields fall back to CNY; empty new groups do not read legacy mixed totals", () => {
  assert.deepEqual(dashboardAmounts(undefined, "periodContractAmount", "185500"), [{ currency: "CNY", amount: 185500 }]);
  assert.deepEqual(dashboardAmounts({}, "totalPaidAmount", "75000"), [{ currency: "CNY", amount: 75000 }]);
  assert.deepEqual(dashboardAmounts({ periodContractAmount: [] }, "periodContractAmount", 211100), []);
  assert.deepEqual(currencyLines([]).primary, "¥0");
});
test("CNY alone and zero foreign amounts never create a foreign line", () => {
  assert.deepEqual(currencyLines([{ currency: "CNY", amount: 185500 }]).foreign, []);
  assert.deepEqual(currencyLines([{ currency: "CNY", amount: 185500 }, { currency: "EUR", amount: 0 }]).foreign, []);
  assert.deepEqual(currencyLines(sumByCurrency(records)).foreign, ["+ €25,600"]);
});
test("two foreign currencies get two lines; three collapse with full hover text", () => {
  const two = [{ currency: "EUR", amount: 25600 }, { currency: "USD", amount: 1234 }];
  assert.deepEqual(currencyLines(two).primary, "¥0");
  assert.deepEqual(currencyLines(two).foreign, ["+ €25,600", "+ USD 1,234"]);
  const lines = currencyLines([...two, { currency: "GBP", amount: 99 }]);
  assert.deepEqual(lines.foreign, ["+ €25,600 等 3 种"]);
  assert.deepEqual(lines.title, "¥0\n+ €25,600\n+ GBP 99\n+ USD 1,234");
});
test("cent aggregation keeps exact fractions", () => {
  assert.deepEqual(sumByCurrency([{ amount: "0.10" }, { amount: "0.20" }]), [{ currency: "CNY", amount: "0.30" }]);
});
test("foreign payments cannot cancel CNY arrears", () => {
  assert.deepEqual(contractPaymentLabel([{ currency: "CNY", amount: 100, paidAmount: 50 }, { currency: "EUR", amount: 10, paidAmount: 1000 }]), "部分回款");
  assert.deepEqual(contractPaymentLabel([{ currency: "CNY", amount: 100, paidAmount: 100 }, { currency: "EUR", amount: 10, paidAmount: 10 }]), "已回款");
  assert.deepEqual(contractPaymentLabel([]), "-");
});
test("historical snapshots do not guess a currency", () => {
  assert.deepEqual(formatPriceSnapshot("100000"), "100,000（币种待确认）");
  assert.deepEqual(formatPriceSnapshot(null), "-");
});
