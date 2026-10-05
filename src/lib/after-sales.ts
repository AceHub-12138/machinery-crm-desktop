export function canCloseAfterSalesOrder(status: string, attachmentCount: number) {
  return status === "COMPLETED" && attachmentCount > 0;
}

/** 平台 PUT /api/after-sales/{id} 仅待派发、已派发可编辑，其余状态服务端返回 409。 */
export function canEditAfterSalesOrder(status: string) {
  return status === "PENDING_DISPATCH" || status === "DISPATCHED";
}

export type AfterSalesAlertState = "normal" | "warning" | "danger";

/** 平台工单返回的 alertState：danger=已超时，warning=距到期不足一天。 */
export function afterSalesAlertLabel(alertState?: string | null): string | null {
  if (alertState === "danger") return "已超时";
  if (alertState === "warning") return "接近超时";
  return null;
}

export function afterSalesAlertTone(alertState?: string | null): string {
  if (alertState === "danger") return "text-bad bg-bad/10";
  if (alertState === "warning") return "text-warn bg-warn/10";
  return "text-dim bg-steel/25";
}

/** 仅使用当前合同接口返回的配件名称做本地匹配，手输新名称不受限制（对齐平台）。 */
export function filterAfterSalesPartOptions(options: readonly string[], query: string) {
  const keyword = query.trim().toLocaleLowerCase("zh-CN");
  if (!keyword) return [];
  return options.filter((option) => option.toLocaleLowerCase("zh-CN").includes(keyword));
}

/** 手输/下拉名称统一去空白，允许任意名称。 */
export function normalizeAfterSalesPartName(value: string) {
  return value.trim();
}

export function appendAfterSalesPart(partNames: readonly string[], name: string) {
  const trimmed = normalizeAfterSalesPartName(name);
  if (!trimmed || partNames.includes(trimmed)) return [...partNames];
  return [...partNames, trimmed];
}

/** 对齐平台 stringList：去空白、去空值、去重。 */
export function normalizeAfterSalesPartNames(partNames: readonly string[]) {
  return [...new Set(partNames.map((name) => normalizeAfterSalesPartName(name)).filter(Boolean))];
}

export interface AfterSalesCreateInput {
  contractId: string;
  orderType: string;
  urgency: string;
  dispatchDate: string;
  serviceAmount: string;
  assigneeNames: string;
  serviceAddress: string;
  description: string;
  partNames: string[];
}

/** PUT /api/after-sales/{id} 的可编辑字段：不含合同，合同快照创建后不可改。 */
export interface AfterSalesUpdateInput {
  orderType: string;
  urgency: string;
  dispatchDate: string;
  serviceAmount: string;
  assigneeNames: string;
  serviceAddress: string;
  description: string;
  partNames: string[];
}

type AfterSalesOrderFieldsInput = Omit<AfterSalesCreateInput, "contractId">;

function normalizeAfterSalesOrderFields(input: AfterSalesOrderFieldsInput) {
  const assigneeNames = input.assigneeNames.trim();
  const serviceAddress = input.serviceAddress.trim();
  const description = input.description.trim();
  if (!input.dispatchDate || !assigneeNames || !description) {
    throw new Error("派发日期、售后人员、工单说明为必填项");
  }
  if (serviceAddress.length > 255) throw new Error("服务地址不能超过 255 个字符");

  const chargeable = input.orderType === "OUT_WARRANTY_PAID";
  const rawAmount = input.serviceAmount.trim();
  if (chargeable && !rawAmount) throw new Error("质保外有偿服务必须填写服务金额");
  if (!chargeable && rawAmount) throw new Error("仅质保外有偿服务可填写服务金额");
  const serviceAmount = rawAmount ? Number(rawAmount) : undefined;
  if (serviceAmount !== undefined && (!Number.isFinite(serviceAmount) || serviceAmount < 0)) {
    throw new Error("服务金额必须为大于等于 0 的数字");
  }

  return {
    orderType: input.orderType,
    urgency: input.urgency,
    dispatchDate: input.dispatchDate,
    ...(serviceAmount === undefined ? {} : { serviceAmount }),
    assigneeNames,
    serviceAddress,
    description,
    partNames: normalizeAfterSalesPartNames(input.partNames),
  };
}

export function buildAfterSalesCreatePayload(input: AfterSalesCreateInput) {
  const contractId = input.contractId.trim();
  if (!contractId) throw new Error("请选择关联合同");
  return {
    contractId,
    ...normalizeAfterSalesOrderFields(input),
  };
}

export function buildAfterSalesUpdatePayload(input: AfterSalesUpdateInput) {
  return normalizeAfterSalesOrderFields(input);
}
