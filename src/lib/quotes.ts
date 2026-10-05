// 报价模块纯逻辑：与平台 /api/customer-quotes 系列接口的校验、汇总、转合同口径保持一致。
// 平台契约（v108）：
//   POST /api/customer-quotes            —— 至少一条主产品，每条主产品必须有报价金额；选配报价可空（记 0）
//   GET  /api/customers/{id}/quotes      —— 该客户报价数组（createdAt desc）
//   GET  /api/customer-quotes/{id}       —— 报价详情
//   GET  /api/customer-quotes/{id}/contract —— 报价已关联的合同 + locked/canEdit
//   POST /api/customer-quotes/{id}/update-contract —— 用报价覆盖合同明细（无请求体）
//   POST /api/contracts { sourceQuoteId } —— 由报价新建合同（明细由平台按报价重建，body.items 被忽略）
import type { CustomerQuoteItemRow, CustomerQuoteRow, QuoteContractLink } from "../types";

export interface QuoteLineInput {
  productId: string;
  quotedPrice: string;
  quantity: string;
}

export interface QuoteItemPayload {
  productId: string;
  itemType: "MAIN" | "OPTIONAL";
  quotedPrice: number;
  quantity: number;
  sortOrder: number;
}

export const QUOTE_MAIN_ERROR = "报价至少需要一个主产品";
export const QUOTE_MAIN_PRICE_ERROR = "每条主产品都必须填写报价金额";
export const QUOTE_CLIENT_HINT = "请为每条主产品选择产品并填写报价";
export const QUOTE_LOCKED_MESSAGE = "当前合同已锁定，如需修改，请联系超级管理员审批。";

/** 明细金额：单价 × 数量（数量缺省按 1，与平台 sumItems 一致） */
export function quoteLineAmount(line: { quotedPrice?: string | number | null; quantity?: string | number | null }): number {
  const price = Number(line.quotedPrice ?? 0) || 0;
  const quantity = Math.trunc(Number(line.quantity ?? 1)) || 1;
  return price * Math.max(1, quantity);
}

/** 报价合计：平台由服务端汇总，这里用于表单实时展示，口径相同 */
export function quoteTotal(items: { quotedPrice?: string | number | null; quantity?: string | number | null }[]): number {
  return items.reduce((sum, item) => sum + quoteLineAmount(item), 0);
}

/** 校验并组装 POST /api/customer-quotes 的 items（主产品在前，与平台 UI 一致） */
export function buildQuoteItemsPayload(mains: QuoteLineInput[], optionals: QuoteLineInput[] = []): QuoteItemPayload[] {
  const filledMains = mains.filter((line) => line.productId);
  if (!filledMains.length) throw new Error(QUOTE_MAIN_ERROR);
  if (filledMains.some((line) => line.quotedPrice === "" || line.quotedPrice === null || line.quotedPrice === undefined)) {
    throw new Error(QUOTE_MAIN_PRICE_ERROR);
  }
  const toItem = (line: QuoteLineInput, itemType: "MAIN" | "OPTIONAL", index: number): QuoteItemPayload => {
    const price = Number(line.quotedPrice === "" ? 0 : line.quotedPrice);
    if (!Number.isFinite(price) || price < 0) throw new Error("产品价格必须为大于等于 0 的数字");
    const quantity = Math.trunc(Number(line.quantity || 1));
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error("产品数量必须为大于 0 的整数");
    return { productId: line.productId, itemType, quotedPrice: price, quantity, sortOrder: index };
  };
  const optionalItems = optionals.filter((line) => line.productId);
  return [
    ...filledMains.map((line, index) => toItem(line, "MAIN", index)),
    ...optionalItems.map((line, index) => toItem(line, "OPTIONAL", filledMains.length + index)),
  ];
}

/** 报价表单提交体 */
export function buildQuotePayload(input: {
  customerId: string;
  currency?: string;
  remark?: string | null;
  mains: QuoteLineInput[];
  optionals?: QuoteLineInput[];
}) {
  if (!input.customerId) throw new Error("请选择客户");
  const items = buildQuoteItemsPayload(input.mains, input.optionals || []);
  return {
    customerId: input.customerId,
    currency: input.currency || "CNY",
    remark: input.remark?.trim() || null,
    items,
  };
}

export interface QuoteItemBreakdown {
  key: string;
  itemType: string;
  itemLabel: "产品" | "选配";
  name: string;
  model: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  factoryPrice: number | null;
}

/** 报价明细展示行：产品/选配 + 名称型号 + 单价×数量 = 小计 + 出厂价（与平台报价记录一致） */
export function quoteItemBreakdown(items?: CustomerQuoteItemRow[] | null): QuoteItemBreakdown[] {
  return (items || []).map((item, index) => {
    const quantity = Math.max(1, Math.trunc(Number(item.quantity ?? 1)) || 1);
    const unitPrice = Number(item.quotedPrice ?? 0) || 0;
    return {
      key: item.id || `${item.productId}-${index}`,
      itemType: item.itemType,
      itemLabel: item.itemType === "MAIN" ? "产品" : "选配",
      name: item.productNameSnapshot || "",
      model: item.productModelSnapshot || item.product?.model || "",
      unitPrice,
      quantity,
      subtotal: quoteLineAmount({ quotedPrice: unitPrice, quantity }),
      factoryPrice: item.factoryPriceSnapshot == null ? null : Number(item.factoryPriceSnapshot),
    };
  });
}

/** 报价单概要：主产品数 / 选配数 / 合计 */
export function quoteSummary(quote: Pick<CustomerQuoteRow, "items" | "quotedPrice">) {
  const breakdown = quoteItemBreakdown(quote.items);
  const fallbackTotal = quoteTotal(breakdown.map((item) => ({ quotedPrice: item.unitPrice, quantity: item.quantity })));
  return {
    mainCount: breakdown.filter((item) => item.itemType === "MAIN").length,
    optionalCount: breakdown.filter((item) => item.itemType !== "MAIN").length,
    total: Number(quote.quotedPrice ?? 0) || fallbackTotal,
    breakdown,
  };
}

/**
 * 报价转合同的 POST /api/contracts 请求体：明细由平台按报价重建，这里提交合同要素。
 * 平台 `attachmentUrl` / `estimatedShipmentDate` 与正常新建合同分支取自同一 body 字段，
 * 报价分支也必须带上，否则表单里填了附件与预计发货日期会被平台存成 null。
 */
export function buildQuoteContractPayload(input: {
  customerId: string;
  quoteId: string;
  contractNo: string;
  currency?: string;
  remark?: string | null;
  signedDate: string;
  contractStatus?: string;
  estimatedShipmentDate?: string | null;
  attachmentUrl?: string | null;
}) {
  const contractNo = input.contractNo.trim();
  if (!input.customerId || !input.quoteId || !contractNo) throw new Error("客户、来源报价和合同编号为必填项");
  return {
    customerId: input.customerId,
    sourceQuoteId: input.quoteId,
    contractNo,
    currency: input.currency || "CNY",
    remark: input.remark?.trim() || null,
    signedDate: input.signedDate,
    contractStatus: input.contractStatus || "SIGNED",
    estimatedShipmentDate: input.estimatedShipmentDate?.trim() || null,
    attachmentUrl: input.attachmentUrl?.trim() || null,
  };
}

/** POST /api/contracts 成功响应只用到新建合同 id（用于转合同后深链到合同详情） */
export interface ContractCreateResult {
  id?: string;
}

/** 报价已转过合同时平台返回 409（error + 已有 contractId），此时应跳到既有合同而不是报错 */
export function duplicateQuoteContractId(error: unknown): string | null {
  const data = (error as { data?: { contractId?: string } } | null)?.data;
  return typeof data?.contractId === "string" && data.contractId ? data.contractId : null;
}

export type QuoteContractAction = "create" | "update" | "locked";

/** 一键转合同的分支判定：无合同→新建（预填报价）；已锁定→提示申请解锁；否则→确认后用报价更新合同 */
export function quoteContractAction(link: Pick<QuoteContractLink, "contract" | "locked">): QuoteContractAction {
  if (!link.contract) return "create";
  if (link.locked) return "locked";
  return "update";
}

/** 报价明细 → 合同明细预览（平台用 quotedPrice 作为 contractPrice） */
export function quoteToContractItems(items?: CustomerQuoteItemRow[] | null) {
  return (items || []).map((item, index) => ({
    productId: item.productId,
    itemType: item.itemType,
    contractPrice: Number(item.quotedPrice ?? 0) || 0,
    quantity: Math.max(1, Math.trunc(Number(item.quantity ?? 1)) || 1),
    sortOrder: index,
    label: `${item.productNameSnapshot || ""} ${item.productModelSnapshot || item.product?.model || ""}`.trim(),
  }));
}
