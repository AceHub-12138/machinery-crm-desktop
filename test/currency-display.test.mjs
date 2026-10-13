import test from "node:test";
import assert from "node:assert/strict";
import { compactMoney, currencyDisplayRows } from "../src/lib/currency.ts";
test("compact values preserve the currency and use Chinese amount units", () => {
  assert.deepEqual(compactMoney(110500), "¥11.05 万");
  assert.deepEqual(compactMoney(185500), "¥18.55 万");
  assert.deepEqual(compactMoney(25600, "EUR"), "€2.56 万");
  assert.deepEqual(compactMoney(120000000), "¥1.2 亿");
  assert.deepEqual(compactMoney(100000000, "USD"), "USD 1 亿");
  assert.deepEqual(compactMoney(-120000000, "EUR"), "€-1.2 亿");
});
test("zero and tiny nonzero amounts are not misrepresented as zero in compact display", () => {
  assert.deepEqual(compactMoney(0), "¥0");
  assert.deepEqual(compactMoney(0.01), "¥0.000001 万");
  assert.deepEqual(compactMoney("invalid"), "-");
  assert.deepEqual(compactMoney(null), "-");
  assert.deepEqual(compactMoney(undefined), "-");
  assert.deepEqual(compactMoney(""), "-");
});
test("full precision and full hover values survive abbreviation", () => {
  const lines = currencyDisplayRows([{ currency: "CNY", amount: "110500.25" }, { currency: "EUR", amount: "25600.50" }]);
  assert.deepEqual(lines.primary.full, "¥110,500.25");
  assert.deepEqual(lines.primary.compact, "¥11.05 万");
  assert.deepEqual(lines.foreign[0].full, "+ €25,600.5");
  assert.deepEqual(lines.foreign[0].compact, "+ €2.56 万");
  assert.deepEqual(lines.title, "¥110,500.25\n+ €25,600.5");
});
test("currency summary text stays separate from the whole number", () => {
  const lines = currencyDisplayRows([{ currency: "EUR", amount: 25600 }, { currency: "USD", amount: 100 }, { currency: "GBP", amount: 20 }]);
  assert.deepEqual(lines.foreign, [{ full: "+ €25,600", compact: "+ €2.56 万", explanation: "等 3 种" }]);
  assert.deepEqual(lines.title, "¥0\n+ €25,600\n+ GBP 20\n+ USD 100");
});
test("CNY-only and zero foreign data stay as a single row", () => {
  const lines = currencyDisplayRows([{ currency: "CNY", amount: 185500 }, { currency: "EUR", amount: 0 }]);
  assert.deepEqual(lines.foreign, []);
  assert.deepEqual(lines.primary.full, "¥185,500");
});
