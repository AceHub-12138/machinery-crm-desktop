import { isInventoryBelowWarningThreshold } from "./erp";
import type { ApiResult, SessionUser } from "./ipc";

export class ApiError extends Error {
  status: number;
  /** 平台返回的原始 JSON：409 重复客户等场景需要读 details/duplicate */
  data?: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export const SERVER_KEY = "dc.server";
export const USER_KEY = "dc.user";

/** 平台线上地址（默认服务器，登录页不再让用户填写） */
export const DEFAULT_SERVER = "https://dachuan.pro";

export function getServerUrl(): string {
  return (localStorage.getItem(SERVER_KEY) || DEFAULT_SERVER).trim().replace(/\/+$/, "");
}

export function setServerUrl(url: string) {
  localStorage.setItem(SERVER_KEY, (url || DEFAULT_SERVER).trim().replace(/\/+$/, ""));
}

export function getCachedUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function cacheUser(user: SessionUser | null) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

function cleanQuery(query?: Record<string, string | undefined>) {
  if (!query) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/* ---------- 预览模式（--dc-preview）：无登录渲染界面骨架，内置示例数据 ---------- */
let previewMode = false;
export async function initPreview() {
  try {
    previewMode = (await window.dachuan.flags()).preview;
  } catch {
    previewMode = false;
  }
  return previewMode;
}
export function isPreview() {
  return previewMode;
}

/** 预览用发货提醒：逾期给 8 条 + 角标 9，用来验证"截断可达"提示与「查看全部 →」 */
const PREVIEW_SHIPMENT_REMINDERS = {
  today: [
    { id: "preview-contract-1", contractNo: "DC-2026-001", estimatedShipmentDate: "2026-09-10", equipmentName: "BK5030 数控插床", equipmentModel: "BK5030", customer: { companyName: "济南德鑫机械有限公司" } },
    { id: "preview-contract-2", contractNo: "DC-2026-002", estimatedShipmentDate: "2026-09-10", equipmentName: "BK5050 数控插床", equipmentModel: "BK5050", customer: { companyName: "常州弘精密制造有限公司" } },
  ],
  sevenDays: [
    { id: "preview-contract-3", contractNo: "DC-2026-003", estimatedShipmentDate: "2026-09-13", equipmentName: "BK5030 数控插床", equipmentModel: "BK5030", customer: { companyName: "东莞恒泰五金制品厂" } },
  ],
  overdue: Array.from({ length: 8 }, (_, i) => ({
    id: `preview-overdue-${i + 1}`,
    contractNo: `DC-2026-1${String(i + 1).padStart(2, "0")}`,
    estimatedShipmentDate: "2026-09-01",
    equipmentName: "BK5030 数控插床",
    equipmentModel: "BK5030",
    customer: { companyName: `逾期示例客户 ${i + 1}` },
  })),
};

/** 预览用售后提醒：进行中 7 条，用来验证卡片内部滚动（角标必须等于可见条数） */
const PREVIEW_AFTER_SALES_REMINDERS = {
  inProgress: Array.from({ length: 7 }, (_, i) => ({
    id: `preview-as-${i + 1}`,
    orderNo: `SH20260${i + 1}`,
    customerNameSnapshot: `售后示例客户 ${i + 1}`,
    equipmentModelSnapshot: "BK5030",
    orderType: "AFTER_SALES_REPAIR",
    urgency: i === 0 ? "URGENT" : "NORMAL",
    status: "IN_PROGRESS",
    dispatchDate: "2026-09-08",
  })),
  overdue: [
    { id: "preview-as-overdue-1", orderNo: "SH2026099", customerNameSnapshot: "超时未回执客户", equipmentModelSnapshot: "BK5050", orderType: "NEW_MACHINE_DEBUG", urgency: "URGENT", status: "DISPATCHED", dispatchDate: "2026-09-02" },
  ],
  completedUnclosed: [
    { id: "preview-as-closed-1", orderNo: "SH2026098", customerNameSnapshot: "已完成未闭环客户", equipmentModelSnapshot: "BK5030", orderType: "IN_WARRANTY_SERVICE", urgency: "NORMAL", status: "COMPLETED", dispatchDate: "2026-09-05" },
  ],
};

const PREVIEW_SALES_TARGETS = {
  period: { type: "MONTH", year: new Date().getFullYear(), index: new Date().getMonth() + 1, label: `${new Date().getFullYear()}年${new Date().getMonth() + 1}月` },
  targets: [
    {
      id: "preview-target-1",
      periodType: "MONTH",
      periodYear: new Date().getFullYear(),
      periodIndex: new Date().getMonth() + 1,
      metric: "CONTRACT_AMOUNT",
      amount: "3000000.00",
      salesUserId: null,
      note: "预览示例目标",
      targetAmount: "3000000.00",
      actualAmount: "685000.00",
      completionRate: 22.8,
      visualRate: 22.8,
      remainingAmount: "2315000.00",
      exceededAmount: "0.00",
      exceeded: false,
      updatedAt: new Date().toISOString(),
    },
  ],
};

const PREVIEW_DASHBOARD = {
  range: { preset: "month", startDate: "", endDate: "" },
  salesUsers: [],
  stats: {
    totalCustomers: 128, todayFollowUp: 6, overdueFollowUp: 3, sevenDayFollowUp: 15,
    periodNewCustomers: 4, periodNewContracts: 6, periodContractAmount: 685000,
    periodPaidAmount: 231000, periodUnpaidAmount: 454000, periodShipments: 3,
    totalContractAmount: 15802140, totalPaidAmount: 8973087.69, totalUnpaidAmount: 6829052.31,
    unpaidContracts: 41, partialPaidContracts: 16,
    todayShipmentDue: 2, sevenDayShipmentDue: 1, overdueShipmentDue: 9,
  },
  shipmentReminders: PREVIEW_SHIPMENT_REMINDERS,
  afterSalesReminders: PREVIEW_AFTER_SALES_REMINDERS,
  recentFollows: [],
  followUpCustomers: [],
};

const PREVIEW_CUSTOMERS = [
  { id: "preview-c1", companyName: "济南德鑫机械有限公司", contactName: "王总", phone: "13800000001", province: "山东省", city: "济南市", customerLevel: "A", status: "NEGOTIATING", createdAt: "2026-08-12T09:00:00+08:00" },
  { id: "preview-c2", companyName: "常州弘精密制造有限公司", contactName: "李经理", phone: "13800000002", province: "江苏省", city: "常州市", customerLevel: "B", status: "QUOTED", createdAt: "2026-08-20T09:00:00+08:00" },
  { id: "preview-c3", companyName: "东莞恒泰五金制品厂", contactName: "陈厂主", phone: "13800000003", province: "广东省", city: "东莞市", customerLevel: "B", status: "NEW_LEAD", createdAt: "2026-09-01T09:00:00+08:00" },
];

const PREVIEW_PRODUCTS = [
  {
    // 带图片/视频/资料路径：预览模式下由主进程返回示例文件，用于验证应用内附件预览
    id: "preview-p1",
    model: "BK5030 数控插床",
    category: "数控插床",
    productType: "MAIN",
    factoryPrice: 70000,
    currency: "CNY",
    isActive: true,
    createdAt: "2026-01-01T00:00:00+08:00",
    imageUrl: "/uploads/products/preview-bk5030.png",
    videoUrl: "/uploads/products/preview-bk5030.mp4",
    remark: "标准配置含平口钳",
    translations: [
      { language: "ZH", name: "BK5030 数控插床", description: "预览模式示例中文说明", specs: { 行程: "300mm" }, pdfUrl: "/uploads/products/preview-bk5030.pdf" },
      { language: "EN", name: "BK5030 CNC Slotting Machine", description: "Preview sample", specs: null, pdfUrl: null },
    ],
  },
  { id: "preview-p2", model: "BK5050 数控插床", category: "数控插床", productType: "MAIN", factoryPrice: 98000, currency: "CNY", isActive: true, createdAt: "2026-01-01T00:00:00+08:00" },
  { id: "preview-p3", model: "平口轴", category: "配件", productType: "OPTIONAL", factoryPrice: 1000, currency: "CNY", isActive: true, createdAt: "2026-01-01T00:00:00+08:00" },
  { id: "preview-p4", model: "三爪卡盘", category: "配件", productType: "OPTIONAL", factoryPrice: 2000, currency: "CNY", isActive: true, createdAt: "2026-01-01T00:00:00+08:00" },
];

const PREVIEW_USERS = [
  { id: "preview-u1", name: "张三", email: "zhang@example.com", role: "SALES", region: "华东", isActive: true, createdAt: "2026-01-15T09:00:00+08:00" },
  { id: "preview-u2", name: "李四", email: "li@example.com", role: "SALES", region: "华北", isActive: true, createdAt: "2026-02-20T09:00:00+08:00" },
  { id: "preview-u3", name: "王五", email: "wang@example.com", role: "FOREIGN_TRADE", region: "华南", isActive: true, createdAt: "2026-03-10T09:00:00+08:00" },
];

const PREVIEW_TASKS = [
  {
    id: "preview-t1",
    sourceType: "CONTRACT_UNLOCK",
    sourceId: "preview-unlock-1",
    module: "CRM",
    taskType: "合同解锁审批",
    title: "合同 DC-2026-001 解锁申请",
    description: "销售人员申请解锁合同以修改产品明细",
    status: "PENDING",
    priority: "NORMAL",
    initiatorId: "preview-u1",
    assigneeId: "preview",
    dueAt: "2026-09-12T18:00:00+08:00",
    createdAt: "2026-09-08T10:30:00+08:00",
    href: "/contracts/preview-c1",
    state: { readAt: null, pinnedAt: null, ignoredAt: null },
  },
  {
    id: "preview-t2",
    sourceType: "SHIPMENT_REMINDER",
    sourceId: "preview-ship-1",
    module: "CRM",
    taskType: "发货提醒",
    title: "合同 DC-2026-002 计划明日发货",
    description: "济南德鑫机械订购的 BK5030 数控插床计划明日发货",
    status: "PENDING",
    priority: "HIGH",
    createdAt: "2026-09-08T08:00:00+08:00",
    dueAt: "2026-09-10T18:00:00+08:00",
    href: "/shipments",
    state: { readAt: null, pinnedAt: "2026-09-08T08:05:00+08:00", ignoredAt: null },
  },
  {
    id: "preview-t3",
    sourceType: "FOLLOW_UP",
    sourceId: "preview-c1",
    module: "CRM",
    taskType: "客户跟进提醒",
    title: "今日待跟进：济南德鑫机械",
    description: "客户处于洽谈阶段，今日需要跟进",
    status: "PENDING",
    priority: "NORMAL",
    createdAt: "2026-09-09T00:00:00+08:00",
    dueAt: "2026-09-09T18:00:00+08:00",
    href: "/customers/preview-c1",
    state: { readAt: "2026-09-09T09:15:00+08:00", pinnedAt: null, ignoredAt: null },
  },
];

const PREVIEW_UNLOCK_REQUESTS = [
  {
    id: "preview-unlock-1",
    contractId: "preview-contract-1",
    reason: "客户要求增加配件，需要修改产品明细",
    status: "PENDING",
    requesterId: "preview-u1",
    createdAt: "2026-09-08T10:30:00+08:00",
    updatedAt: "2026-09-08T10:30:00+08:00",
    requester: { id: "preview-u1", name: "张三" },
    contract: {
      id: "preview-contract-1",
      contractNo: "DC-2026-001",
      equipmentName: "BK5030 数控插床",
      customer: { id: "preview-c1", companyName: "济南德鑫机械有限公司", province: "山东省" },
    },
  },
];

const PREVIEW_DELETE_REQUESTS = [
  {
    id: "preview-delete-1",
    contractId: "preview-contract-2",
    reason: "客户取消订单，合同作废",
    status: "PENDING",
    requesterId: "preview-u2",
    createdAt: "2026-09-07T14:20:00+08:00",
    updatedAt: "2026-09-07T14:20:00+08:00",
    requester: { id: "preview-u2", name: "李四" },
    contract: {
      id: "preview-contract-2",
      contractNo: "DC-2026-002",
      equipmentName: "BK5050 数控插床",
      amount: 98000,
      customer: { id: "preview-c2", companyName: "常州弘精密制造有限公司", province: "江苏省" },
    },
  },
];

/** 预览用报价：覆盖「多主产品 + 选配」「已转合同」两种形态，便于验证报价页与转合同流程 */
const PREVIEW_QUOTES = [
  {
    id: "preview-q1",
    customerId: "preview-c1",
    productId: "preview-p1",
    quotedPrice: 142400,
    currency: "CNY",
    remark: "含运费，30 天账期",
    createdAt: "2026-09-05T10:20:00+08:00",
    createdBy: { id: "preview-u1", name: "张三" },
    product: { model: "BK5030 数控插床", category: "数控插床" },
    sourceContract: null,
    items: [
      { id: "preview-qi1", productId: "preview-p1", itemType: "MAIN", productNameSnapshot: "BK5030 数控插床", productModelSnapshot: "BK5030", factoryPriceSnapshot: 70000, quotedPrice: 70000, quantity: 2, sortOrder: 0 },
      { id: "preview-qi2", productId: "preview-p3", itemType: "OPTIONAL", productNameSnapshot: "平口轴", productModelSnapshot: "平口轴", factoryPriceSnapshot: 1000, quotedPrice: 1200, quantity: 2, sortOrder: 1 },
    ],
  },
  {
    id: "preview-q2",
    customerId: "preview-c2",
    productId: "preview-p2",
    quotedPrice: 98000,
    currency: "CNY",
    remark: null,
    createdAt: "2026-09-08T15:40:00+08:00",
    createdBy: { id: "preview-u2", name: "李四" },
    product: { model: "BK5050 数控插床", category: "数控插床" },
    sourceContract: { id: "preview-contract-1", contractNo: "DC-2026-001", contractStatus: "SIGNED", amount: 98000 },
    items: [
      { id: "preview-qi3", productId: "preview-p2", itemType: "MAIN", productNameSnapshot: "BK5050 数控插床", productModelSnapshot: "BK5050", factoryPriceSnapshot: 98000, quotedPrice: 98000, quantity: 1, sortOrder: 0 },
    ],
  },
];

function previewQuoteLink(rawPath: string) {
  const id = rawPath.split("/api/customer-quotes/")[1]?.split("/")[0] || "";
  const quote = PREVIEW_QUOTES.find((item) => item.id === id);
  if (!quote?.sourceContract) return { contract: null, locked: false, canEdit: true };
  return {
    contract: { id: quote.sourceContract.id, contractNo: quote.sourceContract.contractNo, contractStatus: quote.sourceContract.contractStatus, amount: quote.sourceContract.amount },
    locked: false,
    canEdit: true,
  };
}

/* ---------- 预览用发货数据：覆盖未发货/部分发货/已发货，用于验证发货详情与发货进度 ---------- */

const PREVIEW_SHIPMENT_CUSTOMERS = {
  "preview-contract-1": { id: "preview-c1", companyName: "济南德鑫机械有限公司", contactName: "王总", phone: "13800000001", region: "华东", province: "山东省", city: "济南市" },
  "preview-contract-2": { id: "preview-c2", companyName: "常州弘精密制造有限公司", contactName: "李经理", phone: "13800000002", region: "华东", province: "江苏省", city: "常州市" },
  "preview-contract-3": { id: "preview-c3", companyName: "东莞恒泰五金制品厂", contactName: "陈厂主", phone: "13800000003", region: "华南", province: "广东省", city: "东莞市" },
};

const PREVIEW_SHIPMENT_ADDRESS = {
  "preview-contract-1": "山东省济南市历下区经十路 8888 号 1 号厂房",
  "preview-contract-2": "江苏省常州市武进区湖塘镇工业园 6 号车间",
  "preview-contract-3": "广东省东莞市塘厦镇科技路 12 号 3 号厂房",
};

/**
 * 预览用合同详情（/api/contracts/:id）：主产品 3 台 + 已发 1 台 + 部分发货 1 台 + 待发 1 台，
 * 用来核对发货进度的「合同台数 / 已发货 / 部分发货 / 未发货 / 待发」五项与进度条。
 */
const PREVIEW_SHIPMENT_CONTRACTS: Record<string, any> = {
  "preview-contract-1": {
    id: "preview-contract-1",
    contractNo: "DC-2026-001",
    equipmentName: "BK5030 数控插床",
    equipmentModel: "BK5030",
    amount: 210000,
    paidAmount: 105000,
    unpaidAmount: 105000,
    currency: "CNY",
    contractStatus: "SIGNED",
    paymentStatus: "PARTIAL_PAID",
    signedDate: "2026-08-20",
    estimatedShipmentDate: "2026-09-10",
    salesUser: { id: "preview-u1", name: "张三" },
    customer: PREVIEW_SHIPMENT_CUSTOMERS["preview-contract-1"],
    items: [
      { id: "preview-ci-1", itemType: "MAIN", productNameSnapshot: "BK5030 数控插床", productModelSnapshot: "BK5030", quantity: 3, contractPrice: 70000 },
      { id: "preview-ci-2", itemType: "OPTIONAL", productNameSnapshot: "三爪卡盘", productModelSnapshot: "K11250", quantity: 3, contractPrice: 0 },
    ],
    shipments: [
      { id: "preview-ship-1", shipmentDate: "2026-09-01", quantity: 1, shipmentStatus: "SHIPPED", equipmentName: "BK5030 数控插床", receivingAddress: PREVIEW_SHIPMENT_ADDRESS["preview-contract-1"], driverPhone: "13700000001", deliveryNoteUrl: "/uploads/shipments/preview-note-1.pdf", shipmentPhotoUrl: null, remark: "首批" },
      { id: "preview-ship-2", shipmentDate: "2026-09-08", quantity: 1, shipmentStatus: "PARTIAL_SHIPPED", equipmentName: "BK5030 数控插床", receivingAddress: PREVIEW_SHIPMENT_ADDRESS["preview-contract-1"], driverPhone: "13700000001", deliveryNoteUrl: null, shipmentPhotoUrl: null, remark: "配件未齐，先发主机" },
      { id: "preview-ship-3", shipmentDate: "2026-09-14", quantity: 1, shipmentStatus: "NOT_SHIPPED", equipmentName: "BK5030 数控插床", receivingAddress: PREVIEW_SHIPMENT_ADDRESS["preview-contract-1"], driverPhone: "13700000002", deliveryNoteUrl: null, shipmentPhotoUrl: null, remark: "计划 9/18 发出" },
    ],
  },
  "preview-contract-2": {
    id: "preview-contract-2",
    contractNo: "DC-2026-002",
    equipmentName: "BK5050 数控插床",
    equipmentModel: "BK5050",
    amount: 98000,
    paidAmount: 98000,
    unpaidAmount: 0,
    currency: "CNY",
    contractStatus: "COMPLETED",
    paymentStatus: "PAID",
    signedDate: "2026-08-28",
    estimatedShipmentDate: "2026-09-13",
    salesUser: { id: "preview-u2", name: "李四" },
    customer: PREVIEW_SHIPMENT_CUSTOMERS["preview-contract-2"],
    items: [{ id: "preview-ci-3", itemType: "MAIN", productNameSnapshot: "BK5050 数控插床", productModelSnapshot: "BK5050", quantity: 1, contractPrice: 98000 }],
    shipments: [
      { id: "preview-ship-4", shipmentDate: "2026-09-13", quantity: 1, shipmentStatus: "SHIPPED", equipmentName: "BK5050 数控插床", receivingAddress: PREVIEW_SHIPMENT_ADDRESS["preview-contract-2"], driverPhone: "13700000003", deliveryNoteUrl: "/uploads/shipments/preview-note-2.pdf", shipmentPhotoUrl: "/uploads/shipments/preview-photo-2.png", remark: "" },
    ],
  },
  // 多台待发：合同 5 台只发出 1 台，用来验证「数量按待发台数带入」与「超出可发数量二次确认」
  "preview-contract-3": {
    id: "preview-contract-3",
    contractNo: "DC-2026-003",
    equipmentName: "BK5030 数控插床",
    equipmentModel: "BK5030",
    amount: 350000,
    paidAmount: 0,
    unpaidAmount: 350000,
    currency: "CNY",
    contractStatus: "SIGNED",
    paymentStatus: "UNPAID",
    signedDate: "2026-09-02",
    estimatedShipmentDate: "2026-09-20",
    salesUser: { id: "preview-u3", name: "王五" },
    customer: PREVIEW_SHIPMENT_CUSTOMERS["preview-contract-3"],
    items: [{ id: "preview-ci-4", itemType: "MAIN", productNameSnapshot: "BK5030 数控插床", productModelSnapshot: "BK5030", quantity: 5, contractPrice: 70000 }],
    shipments: [
      { id: "preview-ship-5", shipmentDate: "2026-09-15", quantity: 1, shipmentStatus: "PARTIAL_SHIPPED", equipmentName: "BK5030 数控插床", receivingAddress: PREVIEW_SHIPMENT_ADDRESS["preview-contract-3"], driverPhone: "13700000005", deliveryNoteUrl: null, shipmentPhotoUrl: null, remark: "先发一台试用" },
    ],
  },
};

const PREVIEW_SHIPMENTS = [
  {
    id: "preview-ship-5", contractId: "preview-contract-3", shipmentDate: "2026-09-15", quantity: 1, shipmentStatus: "PARTIAL_SHIPPED",
    equipmentName: "BK5030 数控插床", receivingAddress: PREVIEW_SHIPMENT_ADDRESS["preview-contract-3"], driverPhone: "13700000005",
    deliveryNoteUrl: null, shipmentPhotoUrl: null, remark: "先发一台试用",
    contract: { id: "preview-contract-3", contractNo: "DC-2026-003", equipmentName: "BK5030 数控插床", equipmentModel: "BK5030", salesUser: { id: "preview-u3", name: "王五" }, customer: PREVIEW_SHIPMENT_CUSTOMERS["preview-contract-3"] },
  },
  {
    id: "preview-ship-3", contractId: "preview-contract-1", shipmentDate: "2026-09-14", quantity: 1, shipmentStatus: "NOT_SHIPPED",
    equipmentName: "BK5030 数控插床", receivingAddress: PREVIEW_SHIPMENT_ADDRESS["preview-contract-1"], driverPhone: "13700000002",
    deliveryNoteUrl: null, shipmentPhotoUrl: null, remark: "计划 9/18 发出",
    contract: { id: "preview-contract-1", contractNo: "DC-2026-001", equipmentName: "BK5030 数控插床", equipmentModel: "BK5030", salesUser: { id: "preview-u1", name: "张三" }, customer: PREVIEW_SHIPMENT_CUSTOMERS["preview-contract-1"] },
  },
  {
    id: "preview-ship-2", contractId: "preview-contract-1", shipmentDate: "2026-09-08", quantity: 1, shipmentStatus: "PARTIAL_SHIPPED",
    equipmentName: "BK5030 数控插床", receivingAddress: PREVIEW_SHIPMENT_ADDRESS["preview-contract-1"], driverPhone: "13700000001",
    deliveryNoteUrl: null, shipmentPhotoUrl: null, remark: "配件未齐，先发主机",
    contract: { id: "preview-contract-1", contractNo: "DC-2026-001", equipmentName: "BK5030 数控插床", equipmentModel: "BK5030", salesUser: { id: "preview-u1", name: "张三" }, customer: PREVIEW_SHIPMENT_CUSTOMERS["preview-contract-1"] },
  },
  {
    id: "preview-ship-4", contractId: "preview-contract-2", shipmentDate: "2026-09-13", quantity: 1, shipmentStatus: "SHIPPED",
    equipmentName: "BK5050 数控插床", receivingAddress: PREVIEW_SHIPMENT_ADDRESS["preview-contract-2"], driverPhone: "13700000003",
    deliveryNoteUrl: "/uploads/shipments/preview-note-2.pdf", shipmentPhotoUrl: "/uploads/shipments/preview-photo-2.png", remark: "",
    contract: { id: "preview-contract-2", contractNo: "DC-2026-002", equipmentName: "BK5050 数控插床", equipmentModel: "BK5050", salesUser: { id: "preview-u2", name: "李四" }, customer: PREVIEW_SHIPMENT_CUSTOMERS["preview-contract-2"] },
  },
  {
    id: "preview-ship-1", contractId: "preview-contract-1", shipmentDate: "2026-09-01", quantity: 1, shipmentStatus: "SHIPPED",
    equipmentName: "BK5030 数控插床", receivingAddress: PREVIEW_SHIPMENT_ADDRESS["preview-contract-1"], driverPhone: "13700000001",
    deliveryNoteUrl: "/uploads/shipments/preview-note-1.pdf", shipmentPhotoUrl: null, remark: "首批",
    contract: { id: "preview-contract-1", contractNo: "DC-2026-001", equipmentName: "BK5030 数控插床", equipmentModel: "BK5030", salesUser: { id: "preview-u1", name: "张三" }, customer: PREVIEW_SHIPMENT_CUSTOMERS["preview-contract-1"] },
  },
];

function previewContractDetail(rawPath: string) {
  const id = rawPath.split("/api/contracts/")[1]?.split("/")[0]?.split("?")[0] || "";
  return PREVIEW_SHIPMENT_CONTRACTS[id] || {};
}

const PREVIEW_OPERATION_LOGS = [
  {
    id: "preview-log-1",
    action: "UPDATE_CONTRACT",
    entityType: "Contract",
    entityId: "preview-contract-1",
    userId: "preview-u1",
    beforeData: { amount: 70000, equipmentName: "BK5030 数控插床" },
    afterData: { amount: 75000, equipmentName: "BK5030 数控插床（含配件）" },
    createdAt: "2026-09-08T15:30:00+08:00",
    user: { id: "preview-u1", name: "张三", email: "zhang@example.com" },
  },
  {
    id: "preview-log-2",
    action: "CREATE_CUSTOMER",
    entityType: "Customer",
    entityId: "preview-c3",
    userId: "preview-u3",
    beforeData: null,
    afterData: { companyName: "东莞恒泰五金制品厂", province: "广东省", status: "NEW_LEAD" },
    createdAt: "2026-09-01T09:00:00+08:00",
    user: { id: "preview-u3", name: "王五", email: "wang@example.com" },
  },
];

/* ---------- 预览用 ERP 示例数据：库存与物料一期（仓库/物料/BOM/台账/出入库/调拨/盘点） ---------- */

const PREVIEW_ERP_WAREHOUSES = [
  { id: "preview-wh-1", name: "大川成品仓", code: "DC-CP", address: "总装车间东侧", isActive: true, createdAt: "2026-01-10T09:00:00+08:00", _count: { inventories: 3 } },
  { id: "preview-wh-2", name: "外购件仓", code: "DC-WG", address: "原料库 1 号", isActive: true, createdAt: "2026-02-15T09:00:00+08:00", _count: { inventories: 3 } },
  { id: "preview-wh-3", name: "旧备件仓", code: "DC-BJ", address: "", isActive: false, createdAt: "2026-03-01T09:00:00+08:00", _count: { inventories: 1 } },
];

const PREVIEW_ERP_CATEGORIES = [
  {
    id: "preview-cat-1", name: "机身铸件", code: "SJ", warningThreshold: 10,
    children: [{ id: "preview-cat-1-1", name: "床身铸件", code: "SJ-CS", warningThreshold: 5, children: [] }],
  },
  { id: "preview-cat-2", name: "外购件", code: "WG", warningThreshold: 20, children: [] },
  { id: "preview-cat-3", name: "电器零件包", code: "DQ", warningThreshold: null, children: [] },
];

const PREVIEW_ERP_MATERIALS = [
  { id: "preview-mat-1", code: "JSCJ-0001", name: "底座铸件", categoryId: "preview-cat-1-1", spec: "HT250", unit: "件", standardPrice: 1200, safetyStock: 8, safetyStockEnabled: true, autoPurchaseDraftEnabled: true, procurementLeadDays: 15, supplier: "济南铸造厂", supplierId: null, remark: "关键铸件", isActive: true, deletedAt: null, category: { id: "preview-cat-1-1", name: "床身铸件", code: "SJ-CS", warningThreshold: 5 }, createdAt: "2026-03-02T09:00:00+08:00" },
  { id: "preview-mat-2", code: "JSCJ-0002", name: "立柱铸件", categoryId: "preview-cat-1-1", spec: "HT300", unit: "件", standardPrice: 2400, safetyStock: null, safetyStockEnabled: false, autoPurchaseDraftEnabled: false, procurementLeadDays: 20, supplier: "", supplierId: null, remark: "", isActive: true, deletedAt: null, category: { id: "preview-cat-1-1", name: "床身铸件", code: "SJ-CS", warningThreshold: 5 }, createdAt: "2026-03-02T10:00:00+08:00" },
  { id: "preview-mat-3", code: "WG-1001", name: "三爪卡盘 200mm", categoryId: "preview-cat-2", spec: "K11250", unit: "个", standardPrice: 680, safetyStock: 10, safetyStockEnabled: true, autoPurchaseDraftEnabled: false, procurementLeadDays: 7, supplier: "", supplierId: null, remark: "", isActive: true, deletedAt: null, category: { id: "preview-cat-2", name: "外购件", code: "WG", warningThreshold: 20 }, createdAt: "2026-03-05T09:00:00+08:00" },
  { id: "preview-mat-4", code: "DQ-2001", name: "电控箱线束", categoryId: "preview-cat-3", spec: "BK5030 专用", unit: "套", standardPrice: 450, safetyStock: null, safetyStockEnabled: false, autoPurchaseDraftEnabled: false, procurementLeadDays: 5, supplier: "青岛电器成套", supplierId: null, remark: "零件包分组物料", isActive: true, deletedAt: null, category: { id: "preview-cat-3", name: "电器零件包", code: "DQ", warningThreshold: null }, createdAt: "2026-04-01T09:00:00+08:00" },
];

const PREVIEW_ERP_PRODUCTS = [
  { id: "preview-p1", model: "BK5030", category: "数控插床", productType: "MAIN", isActive: true, translations: [{ language: "ZH", name: "BK5030 数控插床" }] },
  { id: "preview-p2", model: "BK5050", category: "数控插床", productType: "MAIN", isActive: true, translations: [{ language: "ZH", name: "BK5050 数控插床" }] },
];

const PREVIEW_ERP_BOM_ITEMS = [
  { id: "preview-bom-item-1", materialId: "preview-mat-1", quantity: 1, level: 1, parentItemId: null, sortOrder: 0, material: { id: "preview-mat-1", code: "JSCJ-0001", name: "底座铸件", spec: "HT250", unit: "件", standardPrice: 1200, categoryId: "preview-cat-1-1", category: { name: "床身铸件" } } },
  { id: "preview-bom-item-2", materialId: "preview-mat-4", quantity: 1, level: 1, parentItemId: null, sortOrder: 10, material: { id: "preview-mat-4", code: "DQ-2001", name: "电控箱线束", spec: "BK5030 专用", unit: "套", standardPrice: 450, categoryId: "preview-cat-3", category: { name: "电器零件包" } } },
];

const PREVIEW_ERP_BOMS = {
  items: [
    {
      id: "preview-bom-1",
      productId: "preview-p1",
      version: "v1.0",
      isActive: true,
      remark: "BK5030 标准配置",
      updatedAt: "2026-08-20T15:00:00+08:00",
      product: PREVIEW_ERP_PRODUCTS[0],
      items: PREVIEW_ERP_BOM_ITEMS,
    },
    {
      id: "preview-bom-2",
      productId: "preview-p2",
      version: "v1.0",
      isActive: true,
      remark: "",
      updatedAt: "2026-08-25T11:00:00+08:00",
      product: PREVIEW_ERP_PRODUCTS[1],
      items: [],
    },
  ],
  pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
};

const PREVIEW_ERP_INVENTORY = [
  { id: "preview-inv-1", warehouseId: "preview-wh-1", materialId: "preview-mat-1", quantity: 6, totalAmount: 7200, avgPrice: 1200, warehouse: { id: "preview-wh-1", name: "大川成品仓", code: "DC-CP" }, material: PREVIEW_ERP_MATERIALS[0] },
  { id: "preview-inv-2", warehouseId: "preview-wh-1", materialId: "preview-mat-2", quantity: 4, totalAmount: 9600, avgPrice: 2400, warehouse: { id: "preview-wh-1", name: "大川成品仓", code: "DC-CP" }, material: PREVIEW_ERP_MATERIALS[1] },
  { id: "preview-inv-3", warehouseId: "preview-wh-2", materialId: "preview-mat-3", quantity: 18, totalAmount: 12240, avgPrice: 680, warehouse: { id: "preview-wh-2", name: "外购件仓", code: "DC-WG" }, material: PREVIEW_ERP_MATERIALS[2] },
  { id: "preview-inv-4", warehouseId: "preview-wh-2", materialId: "preview-mat-4", quantity: 0, totalAmount: 0, avgPrice: null, warehouse: { id: "preview-wh-2", name: "外购件仓", code: "DC-WG" }, material: PREVIEW_ERP_MATERIALS[3] },
];

const PREVIEW_ERP_STOCK_IN_ITEM = {
  id: "preview-si-item-1",
  materialId: "preview-mat-3",
  quantity: 10,
  unitPrice: 660,
  amount: 6600,
  beforeQty: 8,
  afterQty: 18,
  unitSnapshot: "个",
  materialNameSnapshot: "三爪卡盘 200mm",
  materialCodeSnapshot: "WG-1001",
  materialSpecSnapshot: "K11250",
  material: PREVIEW_ERP_MATERIALS[2],
};

const PREVIEW_ERP_STOCK_INS = [
  {
    id: "preview-si-1",
    batchNo: "2026091001",
    warehouseId: "preview-wh-2",
    type: "PURCHASE",
    status: "CONFIRMED",
    remark: "采购订单 CG20260908001 入库",
    createdAt: "2026-09-10T14:30:00+08:00",
    purchaseOrderId: "preview-po-1",
    purchaseOrder: { id: "preview-po-1", orderNo: "CG20260908001", status: "PARTIAL_RECEIVED" },
    productionOrderId: null,
    voidedAt: null,
    voidReason: null,
    voidedBy: null,
    warehouse: { id: "preview-wh-2", name: "外购件仓", code: "DC-WG" },
    items: [PREVIEW_ERP_STOCK_IN_ITEM],
  },
  {
    id: "preview-si-2",
    batchNo: "2026090502",
    warehouseId: "preview-wh-1",
    type: "INITIAL",
    status: "VOIDED",
    remark: "期初建账",
    createdAt: "2026-09-05T09:10:00+08:00",
    purchaseOrderId: null,
    purchaseOrder: null,
    productionOrderId: null,
    voidedAt: "2026-09-06T10:00:00+08:00",
    voidReason: "期初数量录入错误，作废重录",
    voidedBy: { id: "preview", name: "预览模式" },
    warehouse: { id: "preview-wh-1", name: "大川成品仓", code: "DC-CP" },
    items: [{ ...PREVIEW_ERP_STOCK_IN_ITEM, id: "preview-si-item-2", materialId: "preview-mat-1", quantity: 2, unitPrice: 1200, amount: 2400, beforeQty: 4, afterQty: 6, material: PREVIEW_ERP_MATERIALS[0] }],
  },
];

const PREVIEW_ERP_STOCK_OUTS = [
  {
    id: "preview-so-1",
    batchNo: "CH20260911001",
    warehouseId: "preview-wh-2",
    type: "PRODUCTION",
    status: "CONFIRMED",
    remark: "车间领用",
    createdAt: "2026-09-11T10:00:00+08:00",
    productionOrderId: null,
    warehouse: { id: "preview-wh-2", name: "外购件仓", code: "DC-WG" },
    items: [{ ...PREVIEW_ERP_STOCK_IN_ITEM, id: "preview-so-item-1", quantity: 2, beforeQty: 20, afterQty: 18 }],
  },
];

const PREVIEW_ERP_TRANSFERS = [
  {
    id: "preview-tr-1",
    transferNo: "TR20260909001",
    fromWarehouseId: "preview-wh-2",
    toWarehouseId: "preview-wh-1",
    reason: "装配线调拨",
    createdAt: "2026-09-09T16:00:00+08:00",
    items: [{ id: "preview-tr-item-1", materialId: "preview-mat-3", materialCodeSnapshot: "WG-1001", materialNameSnapshot: "三爪卡盘 200mm", quantity: 3 }],
  },
];

const PREVIEW_ERP_CHECKS = {
  items: [
    {
      id: "preview-sc-1",
      batchNo: "CK20260912001",
      warehouseId: "preview-wh-2",
      status: "DONE",
      remark: "月度抽盘",
      checkDate: "2026-09-12T09:00:00+08:00",
      createdAt: "2026-09-12T09:00:00+08:00",
      warehouse: { id: "preview-wh-2", name: "外购件仓", code: "DC-WG" },
      items: [
        { id: "preview-sc-item-1", materialId: "preview-mat-3", bookQty: 20, actualQty: 18, diffQty: -2, diffAmount: -1360, reason: "运输损耗", material: PREVIEW_ERP_MATERIALS[2] },
      ],
    },
  ],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

/* ---------- 预览用 ERP 示例数据：采购与供应二期 ---------- */

const PREVIEW_ERP_SUPPLIERS = {
  items: [
    { id: "preview-sup-1", name: "济南铸造厂", contactName: "王厂长", phone: "13900000001", wechat: "", email: "", address: "济南明水经济开发区", mainCategory: "机身铸件", remark: "HT250/HT300", isActive: true, createdAt: "2026-03-01T09:00:00+08:00" },
    { id: "preview-sup-2", name: "青岛电器成套", contactName: "刘经理", phone: "13900000002", wechat: "qd-dianqi", email: "sales@example.com", address: "青岛城阳区", mainCategory: "电器零件包", remark: "", isActive: true, createdAt: "2026-04-11T09:00:00+08:00" },
    { id: "preview-sup-3", name: "常州标准件供应", contactName: "陈总", phone: "13900000003", wechat: "", email: "", address: "", mainCategory: "外购标准件", remark: "已终止合作", isActive: false, createdAt: "2026-01-20T09:00:00+08:00" },
  ],
  pagination: { page: 1, pageSize: 20, total: 3, totalPages: 1 },
};

const PREVIEW_ERP_DEMANDS = [
  {
    id: "preview-dem-1", demandNo: "PR-20260912-8F3A21C4", sourceType: "PRODUCTION_ORDER", sourceLabel: "生产工单 GZ2026091001 缺料", status: "APPROVED",
    materialId: "preview-mat-1", material: PREVIEW_ERP_MATERIALS[0], requestedQuantity: 10, suggestedQuantity: 8, convertedQuantity: 0,
    needByDate: "2026-09-20", stockPurpose: null, replenishmentReason: null, createdAt: "2026-09-12T10:00:00+08:00",
  },
  {
    id: "preview-dem-2", demandNo: "PR-20260910-2B7C9911", sourceType: "STOCK_REPLENISHMENT", sourceLabel: "备货", status: "DRAFT",
    materialId: "preview-mat-3", material: PREVIEW_ERP_MATERIALS[2], requestedQuantity: 6, suggestedQuantity: 6, convertedQuantity: 2,
    needByDate: "2026-09-25", stockPurpose: "常用件备货", replenishmentReason: "安全库存补充", createdAt: "2026-09-10T15:00:00+08:00",
  },
  {
    id: "preview-dem-3", demandNo: "PR-20260908-5511AB02", sourceType: "MONTHLY_PRODUCTION_PLAN", sourceLabel: "SPARE-FORECAST-202609-DEMO", status: "CONVERTED",
    materialId: "preview-mat-4", material: PREVIEW_ERP_MATERIALS[3], requestedQuantity: 4, suggestedQuantity: 4, convertedQuantity: 4,
    needByDate: "2026-09-18", stockPurpose: null, replenishmentReason: "售后备件", createdAt: "2026-09-08T09:30:00+08:00",
  },
];

const PREVIEW_ERP_PO_ITEM = {
  id: "preview-po-item-1", materialId: "preview-mat-1", quantity: 8, unitPrice: 1180, amount: 9440, receivedQuantity: 0,
  materialCodeSnapshot: "JSCJ-0001", materialNameSnapshot: "底座铸件", materialSpecSnapshot: "HT250", needArrivalDate: "2026-09-20",
  material: PREVIEW_ERP_MATERIALS[0],
};

const PREVIEW_ERP_PO_LIST = {
  items: [
    { id: "preview-po-1", orderNo: "CG20260912001", supplierId: "preview-sup-1", supplierNameSnapshot: "济南铸造厂", orderDate: "2026-09-12T10:00:00+08:00", expectedArrivalDate: "2026-09-22", remark: "多来源采购需求合并", status: "ORDERED", itemCount: 1, totalAmount: 9440 },
    { id: "preview-po-2", orderNo: "CG20260908003", supplierId: "preview-sup-2", supplierNameSnapshot: "青岛电器成套", orderDate: "2026-09-08T14:00:00+08:00", expectedArrivalDate: "2026-09-15", remark: "", status: "PARTIAL_RECEIVED", itemCount: 2, totalAmount: 18600 },
    { id: "preview-po-3", orderNo: "CG20260914001", supplierId: "preview-sup-1", supplierNameSnapshot: "济南铸造厂", orderDate: "2026-09-14T09:00:00+08:00", expectedArrivalDate: null, remark: "", status: "DRAFT", itemCount: 1, totalAmount: 2400 },
  ],
  pagination: { page: 1, pageSize: 50, total: 3, totalPages: 1 },
};

/* ---------- 预览用 ERP 工作台示例（预览身份为超管，返回 ADMIN 全局视图） ---------- */

const PREVIEW_ERP_DASHBOARD = {
  roleView: "ADMIN",
  generatedAt: new Date().toISOString(),
  production: {
    data: {
      kpis: { inProgress: 3, dueSoon: 1, overdue: 1, pendingKitCheck: 2 },
      statusDistribution: { DRAFT: 1, ISSUED: 3, CHANGE_PENDING: 0, CANCELLED: 1 },
      totals: { riskOrders: 2, shortageOrders: 1 },
    },
  },
  kitCheck: {
    data: {
      total: 3, sufficient: 1, shortage: 1, notChecked: 1,
      rate: 33.3, formula: "完全齐套工单 ÷ 已纳入统计的未删除当前工单 × 100%",
    },
  },
  procurement: {
    data: {
      pendingDemands: 2,
      delayedItems: 1,
      mode: "DETAIL",
      orders: [
        {
          id: "preview-po-2", orderNo: "CG20260908003", status: "PARTIAL_RECEIVED",
          expectedArrivalDate: "2026-09-15", supplier: "青岛电器成套",
          items: [
            { id: "preview-po-item-2", materialCode: "DQ-2001", materialName: "电控箱线束", pendingQuantity: 12, latestPromisedDate: "2026-09-16", deliveryStatus: "OVERDUE_PARTIAL_RECEIVED" },
          ],
        },
        {
          id: "preview-po-1", orderNo: "CG20260912001", status: "ORDERED",
          expectedArrivalDate: "2026-09-22", supplier: "济南铸造厂",
          items: [
            { id: "preview-po-item-1", materialCode: "JSCJ-0001", materialName: "底座铸件", pendingQuantity: 8, latestPromisedDate: "2026-09-13", deliveryStatus: "NOT_DELIVERED" },
          ],
        },
      ],
    },
  },
  inventory: {
    data: {
      totalItems: 4,
      activeKinds: 3,
      alertCount: 2,
      zeroCount: 1,
      inventoryValue: 29040,
      pendingChecks: 1,
      staleMaterials: 1,
      warehouses: [
        { id: "preview-wh-1", name: "大川成品仓", code: "DC-CP", kinds: 2, alertCount: 1, value: 16800 },
        { id: "preview-wh-2", name: "外购件仓", code: "DC-WG", kinds: 1, alertCount: 1, value: 12240 },
        { id: "preview-wh-3", name: "旧备件仓", code: "DC-BJ", kinds: 0, alertCount: 0, value: 0 },
      ],
      alerts: [
        { materialId: "preview-mat-2", code: "JSCJ-0002", name: "立柱铸件", unit: "件", warehouseId: "preview-wh-1", warehouse: "大川成品仓", quantity: 4, threshold: 5, gap: 1 },
        { materialId: "preview-mat-1", code: "JSCJ-0001", name: "底座铸件", unit: "件", warehouseId: "preview-wh-1", warehouse: "大川成品仓", quantity: 6, threshold: 8, gap: 2 },
      ],
    },
  },
  movements: {
    data: {
      items: [
        { id: "preview-mv-1", type: "STOCK_OUT", quantity: -2, unit: "个", materialName: "三爪卡盘 200mm", materialCode: "WG-1001", warehouse: "外购件仓", createdAt: "2026-09-11T10:00:00+08:00" },
        { id: "preview-mv-2", type: "STOCK_IN", quantity: 10, unit: "个", materialName: "三爪卡盘 200mm", materialCode: "WG-1001", warehouse: "外购件仓", createdAt: "2026-09-10T14:30:00+08:00" },
        { id: "preview-mv-3", type: "TRANSFER_OUT", quantity: -3, unit: "个", materialName: "三爪卡盘 200mm", materialCode: "WG-1001", warehouse: "外购件仓", createdAt: "2026-09-09T16:00:00+08:00" },
        { id: "preview-mv-4", type: "CHECK_ADJUST", quantity: -2, unit: "个", materialName: "三爪卡盘 200mm", materialCode: "WG-1001", warehouse: "外购件仓", createdAt: "2026-09-12T09:00:00+08:00" },
        { id: "preview-mv-5", type: "TRANSFER_IN", quantity: 3, unit: "个", materialName: "三爪卡盘 200mm", materialCode: "WG-1001", warehouse: "大川成品仓", createdAt: "2026-09-09T16:00:00+08:00" },
      ],
    },
  },
  alerts: {
    data: {
      pendingStockIn: 2,
      recentVoids: 1,
    },
  },
};

function previewErpPoDetail(path: string) {
  const id = path.split("/api/erp/purchase-orders/")[1]?.split("/")[0] || "";
  const found = PREVIEW_ERP_PO_LIST.items.find((order) => order.id === id);
  const base = found || PREVIEW_ERP_PO_LIST.items[0];
  const items = base.id === "preview-po-2"
    ? [
        { ...PREVIEW_ERP_PO_ITEM, id: "preview-po-item-2", materialId: "preview-mat-4", quantity: 20, unitPrice: 450, amount: 9000, receivedQuantity: 8, material: PREVIEW_ERP_MATERIALS[3], materialCodeSnapshot: "DQ-2001", materialNameSnapshot: "电控箱线束", materialSpecSnapshot: "BK5030 专用" },
        { ...PREVIEW_ERP_PO_ITEM, id: "preview-po-item-3", materialId: "preview-mat-3", quantity: 14, unitPrice: 686, amount: 9604, receivedQuantity: 14, material: PREVIEW_ERP_MATERIALS[2] },
      ]
    : [PREVIEW_ERP_PO_ITEM];
  return { ...base, items, supplier: { id: base.supplierId, name: base.supplierNameSnapshot, isActive: true } };
}

const PREVIEW_ERP_DELIVERIES = {
  items: [
    {
      id: "preview-po-item-2", orderNo: "CG20260908003", supplier: "青岛电器成套",
      materialCodeSnapshot: "DQ-2001", materialNameSnapshot: "电控箱线束",
      quantity: 20, receivedQuantity: 8, remainingQuantity: 12,
      sourceTypes: ["PRODUCTION_ORDER", "STOCK_REPLENISHMENT"],
      demandSources: [
        { id: "preview-ds-1", allocatedQuantity: 12, purchaseDemand: { sourceLabel: "生产工单 GZ2026091001 缺料" } },
        { id: "preview-ds-2", allocatedQuantity: 8, purchaseDemand: { sourceLabel: "备货" } },
      ],
      needArrivalDate: "2026-09-15", firstPromisedDate: "2026-09-12", latestPromisedDate: "2026-09-16",
      actualShipDate: "2026-09-14", promiseHistory: [{}, {}, {}],
      calculatedDeliveryStatus: "OVERDUE_PARTIAL_RECEIVED",
      risk: { level: "OVERDUE", days: -1, affectsProduction: true },
      lastFollowUp: { progress: "SHIPPED", followedAt: "2026-09-14T09:00:00+08:00" },
      deliveryBatches: [
        { id: "preview-batch-1", plannedQuantity: 12, plannedArrivalDate: "2026-09-16", shippedQuantity: 12, actualShipDate: "2026-09-14" },
      ],
    },
    {
      id: "preview-po-item-1", orderNo: "CG20260912001", supplier: "济南铸造厂",
      materialCodeSnapshot: "JSCJ-0001", materialNameSnapshot: "底座铸件",
      quantity: 8, receivedQuantity: 0, remainingQuantity: 8,
      sourceTypes: ["PRODUCTION_ORDER"],
      demandSources: [{ id: "preview-ds-3", allocatedQuantity: 8, purchaseDemand: { sourceLabel: "生产工单 GZ2026091001 缺料" } }],
      needArrivalDate: "2026-09-20", firstPromisedDate: "2026-09-13", latestPromisedDate: "2026-09-13",
      actualShipDate: null, promiseHistory: [{}],
      calculatedDeliveryStatus: "NOT_DELIVERED",
      risk: { level: "ATTENTION", days: 6, affectsProduction: false },
      lastFollowUp: { progress: "IN_PRODUCTION", followedAt: "2026-09-13T16:00:00+08:00" },
      deliveryBatches: [],
    },
  ],
};

function previewErpBomDetail(path: string) {
  const id = path.split("/api/erp/boms/")[1]?.split("/")[0] || "";
  return PREVIEW_ERP_BOMS.items.find((bom) => bom.id === id) || PREVIEW_ERP_BOMS.items[0];
}

function previewFixture(path: string): unknown {
  if (path.startsWith("/api/dashboard")) return PREVIEW_DASHBOARD;
  if (path.startsWith("/api/crm/sales-targets")) return PREVIEW_SALES_TARGETS;
  if (path.startsWith("/api/customer-quotes/") && path.endsWith("/contract")) return previewQuoteLink(path);
  if (path.includes("/quotes")) return PREVIEW_QUOTES;
  if (path.startsWith("/api/customers")) return { customers: PREVIEW_CUSTOMERS, pagination: { page: 1, pageSize: 30, total: PREVIEW_CUSTOMERS.length, totalPages: 1 } };
  if (path.startsWith("/api/users/active")) return PREVIEW_USERS;
  if (path.startsWith("/api/users")) return PREVIEW_USERS;
  if (path.startsWith("/api/system/tasks/monthly")) return { month: new Date().toISOString().slice(0, 7), items: PREVIEW_TASKS.map((task) => ({ ...task, dateField: task.dueAt ? "dueAt" : "createdAt" })) };
  if (path.startsWith("/api/system/tasks")) return { items: PREVIEW_TASKS };
  if (path.startsWith("/api/system/health")) return {
    items: [
      { name: "Web 应用", status: "OK", detail: "当前请求已响应" },
      { name: "数据库", status: "OK", detail: "SELECT 1 成功" },
      { name: "Agent Gateway", status: "NOT_CONNECTED", detail: "未配置" },
    ],
    generatedAt: new Date().toISOString(),
    build: { version: "preview", gitSha: "preview-sha" },
  };
  if (path.startsWith("/api/system/settings")) return {
    items: [
      { id: "preview-set-1", key: "documentNumberRules", value: { PURCHASE_ORDER: { prefix: "CG", sequenceLength: 4, separator: "" }, STOCK_CHECK: { prefix: "PD", sequenceLength: 4, separator: "" }, STOCK_TRANSFER: { prefix: "DB", sequenceLength: 4, separator: "" }, STOCK_OUT: { prefix: "CK", sequenceLength: 4, separator: "" }, AFTER_SALES_ORDER: { prefix: "SH", sequenceLength: 4, separator: "" } }, updatedAt: "2026-09-09T10:00:00+08:00" },
      { id: "preview-set-2", key: "reminders", value: { afterSalesAlertDays: { REPAIR: 3, INSTALL: 7, MAINTAIN: 15, OTHER: 30 } }, updatedAt: "2026-09-09T10:00:00+08:00" },
      { id: "preview-set-3", key: "printInfo", value: { afterSalesPrintInfo: { companyName: "大川重工", contactAddress: "0532-88888888", footerNote: "感谢信任" } }, updatedAt: "2026-09-09T10:00:00+08:00" },
    ],
    environment: { agentGateway: false, agentAppId: false },
  };
  if (path.startsWith("/api/contract-unlock-requests")) return PREVIEW_UNLOCK_REQUESTS;
  if (path.startsWith("/api/contract-delete-requests")) return PREVIEW_DELETE_REQUESTS;
  if (path.startsWith("/api/system/audit/search")) return { items: PREVIEW_OPERATION_LOGS };
  if (path.startsWith("/api/shipments")) return PREVIEW_SHIPMENTS;
  if (path.startsWith("/api/contracts/")) return previewContractDetail(path);
  if (path.startsWith("/api/contracts")) return [];
  // 登记发货的合同下拉（复用平台 /api/after-sales/contracts）：给出预览合同，
  // 这样预览模式下也能验证「选合同自动带出设备 + 数量按待发带入 + 超量二次确认」
  if (path.startsWith("/api/after-sales/contracts")) {
    return {
      items: Object.values(PREVIEW_SHIPMENT_CONTRACTS).map((c) => ({
        id: c.id,
        contractNo: c.contractNo,
        equipmentName: c.equipmentName,
        equipmentModel: c.equipmentModel,
        customer: c.customer ? { id: c.customer.id, companyName: c.customer.companyName } : null,
      })),
    };
  }
  if (path.startsWith("/api/after-sales")) return { items: [], total: 0, page: 1, pageSize: 30 };
  if (path.startsWith("/api/products")) return PREVIEW_PRODUCTS;
  if (path.startsWith("/api/crm/leads")) return { items: [], pagination: { page: 1, pageSize: 30, total: 0, totalPages: 1 } };
  if (path.startsWith("/api/agent/conversations")) return { conversations: [] };
  if (path.startsWith("/api/erp/materials/import")) return { rows: [], summary: { create: 0, update: 0, missingCode: 0, error: 0, total: 0 } };
  if (path.startsWith("/api/erp/purchase-demands/convert")) return previewErpPoDetail("/api/erp/purchase-orders/preview-po-1");
  if (path.startsWith("/api/erp/purchase-demands")) return PREVIEW_ERP_DEMANDS;
  if (path.includes("/api/erp/purchase-orders/")) return previewErpPoDetail(path);
  if (path.startsWith("/api/erp/purchase-orders")) return PREVIEW_ERP_PO_LIST;
  if (path.startsWith("/api/erp/supplier-deliveries")) return PREVIEW_ERP_DELIVERIES;
  if (path.startsWith("/api/erp/suppliers")) return PREVIEW_ERP_SUPPLIERS;
  if (path.startsWith("/api/erp/dashboard")) return PREVIEW_ERP_DASHBOARD;
  if (path.startsWith("/api/erp/procurement-config")) return { attentionDays: 7, highRiskDays: 3, urgentDays: 1 };
  if (path.startsWith("/api/erp/material-categories")) return PREVIEW_ERP_CATEGORIES;
  if (path.startsWith("/api/erp/materials")) return PREVIEW_ERP_MATERIALS;
  if (path.startsWith("/api/erp/document-creators")) return PREVIEW_USERS.map((user) => ({ id: user.id, name: user.name }));
  if (path.startsWith("/api/erp/warehouses")) return PREVIEW_ERP_WAREHOUSES;
  if (path.startsWith("/api/erp/boms/")) return previewErpBomDetail(path);
  if (path.startsWith("/api/erp/boms")) return PREVIEW_ERP_BOMS;
  if (path.startsWith("/api/erp/products")) return PREVIEW_ERP_PRODUCTS;
  if (path.startsWith("/api/erp/inventory")) {
    const alertOnly = new URL(path, "https://preview.invalid").searchParams.get("alertOnly") === "1";
    const items = alertOnly
      ? PREVIEW_ERP_INVENTORY.filter((row) => isInventoryBelowWarningThreshold(row.quantity, row.material ?? {}))
      : PREVIEW_ERP_INVENTORY;
    return { items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: 1 } };
  }
  if (path.startsWith("/api/erp/stock-in/")) return PREVIEW_ERP_STOCK_INS[0];
  if (path.startsWith("/api/erp/stock-in")) return { items: PREVIEW_ERP_STOCK_INS, pagination: { page: 1, pageSize: 20, total: PREVIEW_ERP_STOCK_INS.length, totalPages: 1 } };
  if (path.startsWith("/api/erp/stock-out/")) return PREVIEW_ERP_STOCK_OUTS[0];
  if (path.startsWith("/api/erp/stock-out")) return { items: PREVIEW_ERP_STOCK_OUTS, pagination: { page: 1, pageSize: 20, total: PREVIEW_ERP_STOCK_OUTS.length, totalPages: 1 } };
  if (path.startsWith("/api/erp/stock-transfers")) return PREVIEW_ERP_TRANSFERS;
  if (path.startsWith("/api/erp/stock-checks/")) return PREVIEW_ERP_CHECKS.items[0];
  if (path.startsWith("/api/erp/stock-checks")) return PREVIEW_ERP_CHECKS;
  if (path.startsWith("/api/erp/attachments")) return [];
  if (path.startsWith("/api/upload/avatar")) return { avatarPath: "" };
  return {};
}

/** 预览模式下模拟写接口成功（仅用于无登录验证表单交互，不产生真实数据） */
function previewWrite(path: string): unknown {
  if (path === "/api/customers") {
    return { id: "preview-new-customer", companyName: "预览客户", contactName: "", customerLevel: "B", status: "NEW_LEAD", createdAt: new Date().toISOString() };
  }
  if (path === "/api/contracts") {
    return { id: "preview-new-contract", contractNo: "PREVIEW-001", amount: 0, paidAmount: 0, currency: "CNY", paymentStatus: "UNPAID", contractStatus: "SIGNED" };
  }
  if (path === "/api/shipments") {
    return { id: "preview-new-shipment", shipmentDate: new Date().toISOString(), shipmentStatus: "NOT_SHIPPED" };
  }
  if (path === "/api/after-sales") {
    return { id: "preview-new-order", orderNo: "AS-PREVIEW-001", status: "PENDING_DISPATCH" };
  }
  if (path === "/api/users") {
    return { id: "preview-new-user", name: "新用户", email: "newuser@example.com", role: "SALES", isActive: true };
  }
  if (path.includes("/api/contract-unlock-requests/") && path.includes("/approve")) {
    return { ok: true, message: "已同意解锁申请" };
  }
  if (path.includes("/api/contract-unlock-requests/") && path.includes("/reject")) {
    return { ok: true, message: "已拒绝解锁申请" };
  }
  if (path.includes("/api/contract-delete-requests/") && path.includes("/approve")) {
    return { ok: true, message: "已同意删除申请" };
  }
  if (path.includes("/api/contract-delete-requests/") && path.includes("/reject")) {
    return { ok: true, message: "已拒绝删除申请" };
  }
  if (path === "/api/customer-quotes") {
    return { ...PREVIEW_QUOTES[0], id: "preview-new-quote", sourceContract: null, createdAt: new Date().toISOString() };
  }
  if (path === "/api/erp/warehouses") {
    return { id: "preview-new-wh", name: "预览仓库", code: "PREVIEW-WH", address: "", isActive: true, _count: { inventories: 0 } };
  }
  if (path === "/api/erp/materials") {
    return { ...PREVIEW_ERP_MATERIALS[0], id: "preview-new-material", code: "PREVIEW-001", name: "预览物料" };
  }
  if (path === "/api/erp/stock-in") {
    return { id: "preview-new-stockin", batchNo: "20260914001" };
  }
  if (path === "/api/erp/stock-out") {
    return { id: "preview-new-stockout", batchNo: "CH20260914001" };
  }
  if (path === "/api/erp/stock-transfers") {
    return { ...PREVIEW_ERP_TRANSFERS[0], id: "preview-new-transfer", transferNo: "TR20260914001" };
  }
  if (path === "/api/erp/stock-checks") {
    return { ...PREVIEW_ERP_CHECKS.items[0], id: "preview-new-check", batchNo: "CK20260914001", status: "DRAFT" };
  }
  if (path === "/api/erp/purchase-demands/convert") {
    return previewErpPoDetail("/api/erp/purchase-orders/preview-po-1");
  }
  if (path === "/api/erp/purchase-demands") {
    return { ...PREVIEW_ERP_DEMANDS[1], id: "preview-new-demand", demandNo: "PR-20260914-DEMO0001" };
  }
  if (path === "/api/erp/purchase-orders") {
    return { id: "preview-new-po", orderNo: "CG20260914001", status: "DRAFT", supplierNameSnapshot: "预览供应商" };
  }
  if (path === "/api/erp/suppliers") {
    return { id: "preview-new-supplier", name: "预览供应商", contactName: "联系人", phone: "13800000000", isActive: true };
  }
  if (path.startsWith("/api/erp/material-categories/")) {
    return { ok: true };
  }
  if (path.includes("/api/users/") || path.includes("/api/system/tasks") || path.includes("/api/shipments/") || path.includes("/api/after-sales/")) {
    return { ok: true };
  }
  return { ok: true };
}

/** 平台 API 调用：经主进程转发（自动携带会话 Cookie），401 时广播登录过期；预览模式返回内置示例 */
export async function api<T = any>(
  path: string,
  opts: { method?: string; query?: Record<string, string | undefined>; body?: unknown } = {},
): Promise<T> {
  if (previewMode) {
    if (opts.method && opts.method !== "GET") return previewWrite(path) as T;
    const cleaned = cleanQuery(opts.query);
    const qs = cleaned ? `?${new URLSearchParams(cleaned).toString()}` : "";
    return previewFixture(path + qs) as T;
  }
  const res: ApiResult = await window.dachuan.request({
    baseUrl: getServerUrl(),
    path,
    method: opts.method || "GET",
    query: cleanQuery(opts.query),
    body: opts.body,
  });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent("dc:unauthorized"));
    throw new ApiError("登录已过期，请重新登录", 401);
  }
  if (res.status === 0) throw new ApiError(res.error || "网络错误", 0);
  if (!res.ok) {
    // error 为常规失败；409 重复客户等场景平台返回 warning+message，也要透出给用户
    const message = res.json?.error || res.json?.message || res.error || `请求失败（${res.status}）`;
    throw new ApiError(message, res.status, res.json);
  }
  return res.json as T;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

/** multipart 上传统一走主进程会话，避免 JSON 请求适配器破坏 FormData。 */
export async function uploadFile<T = any>(path: string, file: File, fields?: Record<string, string>): Promise<T> {
  if (previewMode) throw new ApiError("预览模式不支持上传操作", 403);
  const result = await window.dachuan.uploadFile({
    baseUrl: getServerUrl(),
    path,
    name: file.name,
    mime: file.type || "application/octet-stream",
    base64: await fileToBase64(file),
    fields,
  });
  if (result.status === 401) window.dispatchEvent(new CustomEvent("dc:unauthorized"));
  if (!result.ok) {
    const message = result.json?.error || result.json?.message || result.error || `上传失败（${result.status}）`;
    throw new ApiError(message, result.status, result.json);
  }
  return result.json as T;
}
