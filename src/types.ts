// 与平台 API 返回结构对应的渲染端类型（只声明用到的字段）

export interface CustomerRow {
  id: string;
  companyName: string;
  contactName: string;
  phone?: string | null;
  wechat?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  province?: string | null;
  city?: string | null;
  region?: string;
  businessLine?: string;
  address?: string | null;
  customerSource?: string;
  customerType?: string;
  customerLevel: string;
  status: string;
  remark?: string | null;
  lastFollowDate?: string | null;
  nextFollowDate?: string | null;
  createdAt: string;
  assignedUser?: { id: string; name: string } | null;
  contracts?: CustomerContractBrief[];
}

export interface CustomerContractBrief {
  id: string;
  contractNo?: string;
  amount: string | number;
  paidAmount: string | number;
  unpaidAmount?: string | number | null;
  paymentStatus: string;
  contractStatus: string;
}

export interface FollowRecordRow {
  id: string;
  followType: string;
  content: string;
  result?: string | null;
  nextFollowDate?: string | null;
  newStatus?: string | null;
  createdAt: string;
  user?: { name?: string } | null;
}

export interface ContractRow {
  id: string;
  contractNo: string;
  signedDate: string;
  estimatedShipmentDate?: string | null;
  equipmentName: string;
  equipmentModel: string;
  amount: string | number;
  paidAmount: string | number;
  unpaidAmount?: string | number | null;
  currency: string;
  paymentStatus: string;
  contractStatus: string;
  customer?: { id: string; companyName: string; contactName?: string; phone?: string | null; province?: string | null; city?: string | null };
  salesUser?: { id: string; name: string } | null;
  shipments?: { id: string; shipmentStatus: string; shipmentDate?: string | null }[];
  items?: ContractItemRow[];
  payments?: ContractPaymentRow[];
  remark?: string | null;
  /** 平台在 GET /api/contracts/{id} 返回，用于门控编辑/解锁入口 */
  attachmentUrl?: string | null;
  isLocked?: boolean;
  canEdit?: boolean;
}

export interface ContractItemRow {
  id: string;
  productId?: string;
  itemType?: string;
  productNameSnapshot: string;
  productModelSnapshot: string;
  contractPrice?: string | number | null;
  factoryPriceSnapshot?: string | number | null;
  quantity: number;
  estimatedShipmentDate?: string | null;
}

export interface ContractPaymentRow {
  id: string;
  amount: string | number;
  paymentDate: string;
  paymentMethod?: string | null;
  remark?: string | null;
  /** VOIDED = 已作废，平台软删除后保留在列表里 */
  status?: string | null;
}

export interface ConversationRow {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentRow {
  id: string;
  shipmentDate: string;
  receivingAddress?: string | null;
  driverPhone?: string | null;
  equipmentName: string;
  quantity: number;
  shipmentStatus: string;
  remark?: string | null;
  contract?: {
    id: string;
    contractNo: string;
    equipmentName: string;
    equipmentModel: string;
    salesUser?: { id: string; name: string } | null;
    customer?: { id: string; companyName: string; contactName?: string; region?: string } | null;
  } | null;
}

/** 报价明细（平台 CustomerQuoteItem）：quotedPrice 为「单价」，报价单 quotedPrice 才是「合计」 */
export interface CustomerQuoteItemRow {
  id?: string;
  productId: string;
  itemType: string;
  productNameSnapshot?: string | null;
  productModelSnapshot?: string | null;
  factoryPriceSnapshot?: string | number | null;
  quotedPrice?: string | number | null;
  quantity?: number | null;
  sortOrder?: number | null;
  product?: { id?: string; model?: string | null; category?: string | null; factoryPrice?: string | number | null } | null;
}

export interface CustomerQuoteRow {
  id: string;
  customerId?: string;
  productId: string;
  /** 报价合计（平台由明细服务端汇总） */
  quotedPrice: string | number;
  currency: string;
  remark?: string | null;
  createdAt: string;
  createdBy?: { id?: string; name?: string | null } | null;
  product?: { model?: string | null; category?: string | null } | null;
  sourceContract?: { id: string; contractNo: string; contractStatus?: string | null; amount?: string | number | null } | null;
  items?: CustomerQuoteItemRow[];
}

/** 报价转合同：新建合同表单的报价来源（明细由平台按报价重建，表单只做只读展示） */
export interface QuoteContractSource {
  id: string;
  customerId?: string;
  currency?: string;
  remark?: string | null;
  items?: CustomerQuoteItemRow[];
}

/** GET /api/customer-quotes/[id]/contract 的返回：报价已关联的合同与可编辑性 */
export interface QuoteContractLink {
  contract: {
    id: string;
    contractNo: string;
    contractStatus?: string | null;
    amount?: string | number | null;
  } | null;
  locked: boolean;
  canEdit: boolean;
}

export interface AfterSalesRow {
  contractId?: string;
  parts?: { id: string; partName: string }[];
  otherReason?: string | null;
  id: string;
  orderNo: string;
  contractNoSnapshot: string;
  customerNameSnapshot: string;
  equipmentModelSnapshot: string;
  orderType: string;
  urgency: string;
  dispatchDate: string;
  completedDate?: string | null;
  status: string;
  serviceAmount?: string | number | null;
  assigneeNames: string;
  serviceAddress?: string | null;
  description: string;
  receiptContent?: string | null;
  problemCategory?: string | null;
  satisfaction?: string | null;
  alertState?: string;
}

export interface ErpAttachmentRow {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string | null;
  fileSize?: number | null;
  uploadedById?: string | null;
  createdAt?: string;
}

export interface ProductRow {
  id: string;
  model: string;
  category: string;
  productType: string;
  factoryPrice?: string | number | null;
  currency: string;
  remark?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  translations?: ProductTranslationRow[];
  isActive: boolean;
  createdAt: string;
}

export interface ProductTranslationRow {
  id?: string;
  language: string;
  name: string;
  description?: string | null;
  specs?: unknown;
  pdfUrl?: string | null;
}

export interface LeadRow {
  id: string;
  companyName: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  source: string;
  searchKeyword?: string | null;
  aiScore?: number | null;
  reviewStatus: string;
  feedbackVersion: number;
  createdAt: string;
  assignedUser?: { id: string; name: string } | null;
}

/** 平台 GET /api/system/settings 返回的配置行（value 为白名单业务配置对象） */
export interface SettingRow {
  id?: string;
  key: string;
  value: unknown;
  updatedAt?: string;
}

export interface ChatMessageRow {
  id: string;
  role: string;
  content: string;
  error?: boolean;
  durationMs?: number;
  createdAt?: string;
  attachments?: { url: string; name: string; type: string; size: number; kind: string }[] | null;
  toolSummary?: { tool: string; ok: boolean; durationMs: number }[] | null;
}

/* ---------- ERP：库存与物料（平台 /api/erp/* 对齐的行类型） ---------- */

export interface ErpWarehouseRow {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  isActive: boolean;
  createdAt?: string;
  _count?: { inventories?: number } | null;
}

export interface ErpMaterialCategoryRow {
  id: string;
  name: string;
  code?: string | null;
  warningThreshold?: number | null;
  children?: ErpMaterialCategoryRow[] | null;
}

export interface ErpMaterialRow {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  spec?: string | null;
  materialType?: string | null;
  drawingNo?: string | null;
  supplier?: string | null;
  supplierId?: string | null;
  unit: string;
  standardPrice?: number | string | null;
  safetyStock?: number | string | null;
  minStock?: number | string | null;
  maxStock?: number | string | null;
  procurementLeadDays?: number;
  safetyStockEnabled?: boolean;
  autoPurchaseDraftEnabled?: boolean;
  weight?: number | string | null;
  remark?: string | null;
  isActive?: boolean;
  deletedAt?: string | null;
  category?: { id: string; name: string; code?: string | null; warningThreshold?: number | null } | null;
  createdAt?: string;
}

export interface ErpInventoryRow {
  id: string;
  warehouseId: string;
  materialId: string;
  quantity: number | string;
  totalAmount?: number | string | null;
  avgPrice?: number | string | null;
  warehouse?: { id: string; name: string; code?: string | null } | null;
  material?: ErpMaterialRow | null;
}

export interface ErpBomItemRow {
  id?: string;
  materialId: string;
  quantity: number | string;
  level?: number | string;
  parentItemId?: string | null;
  sortOrder?: number;
  material?: Pick<ErpMaterialRow, "id" | "code" | "name" | "spec" | "unit" | "standardPrice" | "categoryId"> & {
    category?: { name?: string | null } | null;
  } | null;
}

export interface ErpBomRow {
  id: string;
  productId: string;
  version: string;
  isActive: boolean;
  remark?: string | null;
  createdAt?: string;
  updatedAt?: string;
  items?: ErpBomItemRow[];
  product?: {
    id?: string;
    model?: string | null;
    category?: string | null;
    translations?: { language: string; name: string }[] | null;
  } | null;
}

export interface ErpStockMovementRow {
  id: string;
  type: string;
  quantity: number | string;
  beforeQty?: number | string | null;
  afterQty?: number | string | null;
  createdAt?: string;
  remark?: string | null;
  material?: { id?: string; code?: string | null; name?: string | null } | null;
}

export interface ErpStockDocumentItemRow {
  id: string;
  materialId: string;
  quantity: number | string;
  unitPrice?: number | string | null;
  amount?: number | string | null;
  beforeQty?: number | string | null;
  afterQty?: number | string | null;
  unitSnapshot?: string | null;
  materialNameSnapshot?: string | null;
  materialCodeSnapshot?: string | null;
  materialSpecSnapshot?: string | null;
  material?: Pick<ErpMaterialRow, "id" | "code" | "name" | "spec" | "unit"> | null;
}

export interface ErpStockInRow {
  id: string;
  batchNo: string;
  warehouseId?: string;
  type: string;
  status: string;
  remark?: string | null;
  createdAt: string;
  purchaseOrderId?: string | null;
  purchaseOrder?: { id: string; orderNo: string; status?: string } | null;
  productionOrderId?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  voidedById?: string | null;
  voidedBy?: { id?: string; name?: string } | null;
  items?: ErpStockDocumentItemRow[];
  warehouse?: { id: string; name: string; code?: string | null } | null;
  createdBy?: { id?: string; name?: string } | null;
  /** 详情接口返回：作废反向冲减单 */
  voidRecord?: {
    id?: string;
    voidedAt?: string | null;
    items?: {
      id: string;
      materialId?: string;
      quantity: number | string;
      beforeQty?: number | string | null;
      afterQty?: number | string | null;
      reversalAmount?: number | string | null;
      material?: Pick<ErpMaterialRow, "id" | "code" | "name"> | null;
    }[];
  } | null;
  /** 详情接口返回：本单产生的库存流水 */
  stockMovements?: ErpStockMovementRow[];
  /** 详情接口返回：操作日志（创建/作废） */
  operationLogs?: { id: string; action?: string; createdAt?: string }[];
}

export interface ErpStockOutRow {
  id: string;
  batchNo: string;
  warehouseId?: string;
  type: string;
  status?: string;
  remark?: string | null;
  createdAt: string;
  productionOrderId?: string | null;
  items?: ErpStockDocumentItemRow[];
  warehouse?: { id: string; name: string; code?: string | null } | null;
  createdBy?: { id?: string; name?: string } | null;
}

export interface ErpStockTransferRow {
  id: string;
  transferNo: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  reason?: string | null;
  createdAt: string;
  items?: {
    id?: string;
    materialId: string;
    materialCodeSnapshot?: string | null;
    materialNameSnapshot?: string | null;
    quantity: number | string;
  }[];
}

export interface ErpStockCheckItemRow {
  id: string;
  materialId: string;
  bookQty: number | string;
  actualQty?: number | string | null;
  diffQty?: number | string | null;
  diffAmount?: number | string | null;
  reason?: string | null;
  material?: Pick<ErpMaterialRow, "id" | "code" | "name" | "spec" | "unit" | "standardPrice"> | null;
}

export interface ErpStockCheckRow {
  id: string;
  batchNo: string;
  warehouseId: string;
  status: string;
  remark?: string | null;
  checkDate?: string;
  createdAt?: string;
  items?: ErpStockCheckItemRow[];
  warehouse?: { id: string; name: string; code?: string | null } | null;
  createdBy?: { id?: string; name?: string } | null;
}

/** 平台采购单只读投影：入库单「来源采购单」预填用 */
export interface ErpPurchaseOrderForStockIn {
  id: string;
  orderNo: string;
  status: string;
  items?: {
    id: string;
    materialId: string;
    quantity: number | string;
    receivedQuantity?: number | string | null;
    unitPrice?: number | string | null;
  }[];
}

export interface ErpSupplierRow {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  wechat?: string | null;
  email?: string | null;
  address?: string | null;
  mainCategory?: string | null;
  remark?: string | null;
  isActive?: boolean;
  createdAt?: string;
}

export interface ErpPurchaseDemandRow {
  id: string;
  demandNo?: string;
  sourceType: string;
  sourceLabel?: string | null;
  status: string;
  materialId?: string;
  material?: Pick<ErpMaterialRow, "id" | "code" | "name" | "spec" | "unit" | "standardPrice"> | null;
  requestedQuantity: number | string;
  suggestedQuantity?: number | string;
  convertedQuantity?: number | string;
  needByDate?: string | null;
  stockPurpose?: string | null;
  replenishmentReason?: string | null;
  createdAt?: string;
}

export interface ErpPurchaseOrderItemRow {
  id: string;
  materialId: string;
  quantity: number | string;
  unitPrice?: number | string | null;
  amount?: number | string | null;
  receivedQuantity?: number | string | null;
  materialCodeSnapshot?: string | null;
  materialNameSnapshot?: string | null;
  materialSpecSnapshot?: string | null;
  needArrivalDate?: string | null;
  material?: Pick<ErpMaterialRow, "id" | "code" | "name" | "spec" | "unit"> | null;
}

export interface ErpPurchaseOrderRow {
  id: string;
  orderNo: string;
  supplierId?: string;
  supplierNameSnapshot?: string | null;
  supplier?: { id: string; name: string; isActive?: boolean } | null;
  orderDate?: string;
  expectedArrivalDate?: string | null;
  remark?: string | null;
  status: string;
  itemCount?: number;
  totalAmount?: number | string | null;
  createdAt?: string;
  items?: ErpPurchaseOrderItemRow[];
}

export interface ErpDeliveryRow {
  id: string;
  orderNo?: string;
  supplier?: string | null;
  materialCodeSnapshot?: string | null;
  materialNameSnapshot?: string | null;
  quantity: number | string;
  receivedQuantity?: number | string;
  remainingQuantity?: number;
  sourceTypes?: string[];
  demandSources?: { id: string; allocatedQuantity: number | string; purchaseDemand?: { sourceLabel?: string | null } | null }[];
  needArrivalDate?: string | null;
  firstPromisedDate?: string | null;
  latestPromisedDate?: string | null;
  actualShipDate?: string | null;
  promiseHistory?: unknown[];
  deliveryBatches?: { id: string; plannedQuantity: number | string; plannedArrivalDate?: string | null; shippedQuantity?: number | string | null; actualShipDate?: string | null }[];
  calculatedDeliveryStatus?: string;
  risk?: { level: string; days?: number | null; affectsProduction?: boolean };
  lastFollowUp?: { progress?: string; followedAt?: string } | null;
}

/* ---------- ERP 工作台（平台 /api/erp/dashboard 对齐） ---------- */

export type ErpDashboardRoleView = "ADMIN" | "PURCHASE" | "WAREHOUSE";

export interface ErpDashboardSection<T> { data?: T; error?: string }

export interface ErpDashboardProductionData {
  kpis: { inProgress: number; dueSoon: number; overdue: number; pendingKitCheck: number };
  statusDistribution: Record<string, number>;
  totals: { riskOrders: number; shortageOrders: number };
}

export interface ErpDashboardKitCheckData {
  total: number; sufficient: number; shortage: number; notChecked: number;
  rate?: number | null; formula?: string;
}

export interface ErpDashboardProcurementOrderItem {
  id: string; materialCode?: string | null; materialName?: string | null;
  pendingQuantity: number; latestPromisedDate?: string | null; deliveryStatus?: string;
}

export interface ErpDashboardProcurementData {
  pendingDemands: number; delayedItems: number; mode?: "DETAIL" | "RECEIVING_ONLY";
  orders: {
    id: string; orderNo: string; status: string; expectedArrivalDate?: string | null;
    supplier?: string | null; items: ErpDashboardProcurementOrderItem[];
  }[];
}

export interface ErpDashboardInventoryAlertItem {
  materialId: string; code: string; name: string; unit: string;
  warehouseId: string; warehouse: string; quantity: number; threshold: number; gap: number;
}

export interface ErpDashboardInventoryData {
  totalItems: number; activeKinds: number; alertCount: number; zeroCount: number;
  inventoryValue?: number; pendingChecks: number; staleMaterials: number;
  warehouses: { id: string; name: string; code?: string | null; kinds: number; alertCount: number; value?: number }[];
  alerts: ErpDashboardInventoryAlertItem[];
}

export interface ErpDashboardMovementItem {
  id: string; type: string; quantity: number; unit?: string | null;
  materialName?: string | null; materialCode?: string | null; warehouse?: string | null; createdAt?: string;
}

export interface ErpDashboardAlertsData {
  pendingStockIn: number; recentVoids?: number;
}

export interface ErpDashboardResponse {
  roleView: ErpDashboardRoleView;
  generatedAt?: string;
  production?: ErpDashboardSection<ErpDashboardProductionData>;
  kitCheck?: ErpDashboardSection<ErpDashboardKitCheckData>;
  procurement?: ErpDashboardSection<ErpDashboardProcurementData>;
  inventory?: ErpDashboardSection<ErpDashboardInventoryData>;
  movements?: ErpDashboardSection<{ items: ErpDashboardMovementItem[] }>;
  alerts?: ErpDashboardSection<ErpDashboardAlertsData>;
}
