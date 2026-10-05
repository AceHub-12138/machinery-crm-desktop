import { test } from "node:test";
import assert from "node:assert/strict";

import {
  QUOTE_MAIN_ERROR,
  QUOTE_MAIN_PRICE_ERROR,
  buildQuoteContractPayload,
  buildQuoteItemsPayload,
  buildQuotePayload,
  duplicateQuoteContractId,
  quoteContractAction,
  quoteItemBreakdown,
  quoteLineAmount,
  quoteSummary,
  quoteToContractItems,
  quoteTotal,
} from "../src/lib/quotes.ts";

test("报价转合同只提交平台从原报价重建明细所需字段", () => {
  assert.deepEqual(
    buildQuoteContractPayload({
      customerId: "customer-1",
      quoteId: "quote-1",
      contractNo: "  DC-2026-001  ",
      currency: "CNY",
      remark: "  报价备注  ",
      signedDate: "2026-09-10",
    }),
    {
      customerId: "customer-1",
      sourceQuoteId: "quote-1",
      contractNo: "DC-2026-001",
      currency: "CNY",
      remark: "报价备注",
      signedDate: "2026-09-10",
      contractStatus: "SIGNED",
      estimatedShipmentDate: null,
      attachmentUrl: null,
    },
  );
});

// 回归：报价转合同过去漏传 attachmentUrl/estimatedShipmentDate，平台存成 null，
// 用户在合同管理里看不到刚上传的附件（平台两个分支读的是同一组 body 字段）。
test("报价转合同必须带上附件与预计发货日期（平台按 body 同名字段落库）", () => {
  const payload = buildQuoteContractPayload({
    customerId: "customer-1",
    quoteId: "quote-1",
    contractNo: "DC-2026-001",
    signedDate: "2026-09-10",
    estimatedShipmentDate: "2026-10-01",
    attachmentUrl: "  /uploads/contracts/abc.pdf  ",
  });
  assert.equal(payload.attachmentUrl, "/uploads/contracts/abc.pdf");
  assert.equal(payload.estimatedShipmentDate, "2026-10-01");

  const blank = buildQuoteContractPayload({
    customerId: "customer-1",
    quoteId: "quote-1",
    contractNo: "DC-2026-001",
    signedDate: "2026-09-10",
    estimatedShipmentDate: "   ",
    attachmentUrl: "",
  });
  assert.equal(blank.attachmentUrl, null, "空附件要显式传 null，不能省略字段");
  assert.equal(blank.estimatedShipmentDate, null);
});

test("报价重复转合同：409 响应里的 contractId 要能取出来深链到既有合同", () => {
  assert.equal(duplicateQuoteContractId({ data: { error: "该报价已生成合同，不能重复创建", contractId: "c-9" } }), "c-9");
  assert.equal(duplicateQuoteContractId({ data: { error: "其他错误" } }), null);
  assert.equal(duplicateQuoteContractId({ data: { contractId: "" } }), null);
  assert.equal(duplicateQuoteContractId(new Error("网络错误")), null);
  assert.equal(duplicateQuoteContractId(null), null);
});

test("报价转合同：客户、报价、合同编号缺一不可", () => {
  const base = { customerId: "c1", quoteId: "q1", contractNo: "DC-1", signedDate: "2026-09-10" };
  assert.throws(() => buildQuoteContractPayload({ ...base, contractNo: "   " }), /必填项/);
  assert.throws(() => buildQuoteContractPayload({ ...base, customerId: "" }), /必填项/);
  assert.throws(() => buildQuoteContractPayload({ ...base, quoteId: "" }), /必填项/);
  assert.equal(buildQuoteContractPayload({ ...base, contractStatus: "DRAFT" }).contractStatus, "DRAFT");
});

test("报价明细：主产品在前并重排 sortOrder，选配可空价格记 0", () => {
  const items = buildQuoteItemsPayload(
    [{ productId: "p1", quotedPrice: "70000", quantity: "2" }],
    [{ productId: "p3", quotedPrice: "", quantity: "1" }],
  );
  assert.deepEqual(items, [
    { productId: "p1", itemType: "MAIN", quotedPrice: 70000, quantity: 2, sortOrder: 0 },
    { productId: "p3", itemType: "OPTIONAL", quotedPrice: 0, quantity: 1, sortOrder: 1 },
  ]);
});

test("报价明细：没有主产品、主产品未填报价、数量或价格非法都要报错", () => {
  assert.throws(() => buildQuoteItemsPayload([{ productId: "", quotedPrice: "1", quantity: "1" }]), new RegExp(QUOTE_MAIN_ERROR));
  assert.throws(
    () => buildQuoteItemsPayload([{ productId: "p1", quotedPrice: "", quantity: "1" }]),
    new RegExp(QUOTE_MAIN_PRICE_ERROR),
  );
  assert.throws(() => buildQuoteItemsPayload([{ productId: "p1", quotedPrice: "1", quantity: "0" }]), /数量/);
  assert.throws(() => buildQuoteItemsPayload([{ productId: "p1", quotedPrice: "-1", quantity: "1" }]), /价格/);
});

test("报价合计按单价 × 数量汇总（数量缺省按 1）", () => {
  assert.equal(quoteLineAmount({ quotedPrice: "1200", quantity: "2" }), 2400);
  assert.equal(quoteLineAmount({ quotedPrice: 500, quantity: 0 }), 500);
  assert.equal(quoteLineAmount({ quotedPrice: null, quantity: null }), 0);
  assert.equal(quoteTotal([{ quotedPrice: 70000, quantity: 2 }, { quotedPrice: 1200, quantity: 2 }]), 142400);
});

test("报价表单提交体：备注去空、币种默认 CNY", () => {
  assert.deepEqual(
    buildQuotePayload({
      customerId: "c1",
      remark: "   ",
      mains: [{ productId: "p1", quotedPrice: "100", quantity: "1" }],
    }),
    {
      customerId: "c1",
      currency: "CNY",
      remark: null,
      items: [{ productId: "p1", itemType: "MAIN", quotedPrice: 100, quantity: 1, sortOrder: 0 }],
    },
  );
  assert.throws(() => buildQuotePayload({ customerId: "", mains: [] }), /请选择客户/);
});

test("报价明细展示：产品/选配标签、小计与出厂价", () => {
  const rows = quoteItemBreakdown([
    {
      id: "i1",
      productId: "p1",
      itemType: "MAIN",
      productNameSnapshot: "BK5030 数控插床",
      productModelSnapshot: "BK5030",
      factoryPriceSnapshot: "70000",
      quotedPrice: "70000",
      quantity: 2,
    },
    { id: "i2", productId: "p3", itemType: "OPTIONAL", productNameSnapshot: "平口轴", quotedPrice: null, quantity: 0 },
  ]);
  assert.equal(rows[0].itemLabel, "产品");
  assert.equal(rows[0].subtotal, 140000);
  assert.equal(rows[0].factoryPrice, 70000);
  assert.equal(rows[1].itemLabel, "选配");
  assert.equal(rows[1].quantity, 1);
  assert.equal(rows[1].subtotal, 0);
  assert.equal(rows[1].model, "");
});

test("报价概要：主产品/选配数量与合计（报价单金额优先，缺失时按明细汇总）", () => {
  const items = [
    { productId: "p1", itemType: "MAIN", quotedPrice: 70000, quantity: 2 },
    { productId: "p2", itemType: "MAIN", quotedPrice: 100, quantity: 1 },
    { productId: "p3", itemType: "OPTIONAL", quotedPrice: 1200, quantity: 2 },
  ];
  const summary = quoteSummary({ items, quotedPrice: 142400 });
  assert.equal(summary.mainCount, 2);
  assert.equal(summary.optionalCount, 1);
  assert.equal(summary.total, 142400);
  assert.equal(quoteSummary({ items, quotedPrice: null }).total, 142500);
});

test("一键转合同分支：无合同→新建，锁定→提示解锁，可编辑→更新合同", () => {
  assert.equal(quoteContractAction({ contract: null, locked: false }), "create");
  assert.equal(quoteContractAction({ contract: { id: "c1", contractNo: "DC-1" }, locked: true }), "locked");
  assert.equal(quoteContractAction({ contract: { id: "c1", contractNo: "DC-1" }, locked: false }), "update");
});

test("报价明细转合同明细：quotedPrice 作为合同价，数量至少 1", () => {
  assert.deepEqual(
    quoteToContractItems([
      { productId: "p1", itemType: "MAIN", quotedPrice: "70000", quantity: 2, productNameSnapshot: "BK5030", productModelSnapshot: "BK5030" },
      { productId: "p3", itemType: "OPTIONAL", quotedPrice: null, quantity: 0 },
    ]),
    [
      { productId: "p1", itemType: "MAIN", contractPrice: 70000, quantity: 2, sortOrder: 0, label: "BK5030 BK5030" },
      { productId: "p3", itemType: "OPTIONAL", contractPrice: 0, quantity: 1, sortOrder: 1, label: "" },
    ],
  );
});
