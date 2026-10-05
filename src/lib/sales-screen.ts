/** 展厅大屏配置契约与纯逻辑：与 Web 平台 src/modules/screen/config.ts 及
 * src/components/admin/sales-screen-config-card.tsx 的文案、默认值、校验保持逐字一致。
 * 权限不在客户端复制：读写仍由平台 middleware 与服务层 SUPER_ADMIN 校验，此处校验仅用于体验。 */

export const SALES_SCREEN_SETTING_KEY = "salesScreen";

export type SalesScreenConfig = {
  version: 1;
  enabled: boolean;
  modules: {
    operatingKpis: boolean;
    deliveryMap: boolean;
    collection: boolean;
    deliveryAlerts: boolean;
    deliveryMilestones: boolean;
  };
  multipliers: {
    amount: number;
    customerCount: number;
    contractCount: number;
    shipmentCount: number;
  };
  privacy: {
    contractNumberMode: "masked" | "hidden";
    addressLevel: "province" | "provinceCity";
    showDisplayNotice: boolean;
  };
};

export const DEFAULT_SALES_SCREEN_CONFIG: SalesScreenConfig = {
  version: 1,
  enabled: false,
  modules: {
    operatingKpis: true,
    deliveryMap: true,
    collection: true,
    deliveryAlerts: true,
    deliveryMilestones: true,
  },
  multipliers: {
    amount: 1,
    customerCount: 1,
    contractCount: 1,
    shipmentCount: 1,
  },
  privacy: {
    contractNumberMode: "masked",
    addressLevel: "provinceCity",
    showDisplayNotice: true,
  },
};

export type MultiplierField = "amount" | "customerCount" | "contractCount" | "shipmentCount";
export type ModuleField = keyof SalesScreenConfig["modules"];

export type SalesScreenShareView = {
  share: {
    version: 1;
    publicId: string | null;
    createdAt: string | null;
    rotatedAt: string | null;
    revokedAt: string | null;
  };
  path: string | null;
};

/** 与 Web 配置卡片一致的展示文案 */
export const MODULE_OPTIONS: Array<{ key: ModuleField; label: string; description: string }> = [
  { key: "operatingKpis", label: "经营指标", description: "本期合同额、客户与合同数量等左侧经营读数" },
  { key: "deliveryMap", label: "交付态势地图", description: "中央全国交付路线地图与省级发货量" },
  { key: "collection", label: "合同与回款", description: "累计回款圆环与月度目标完成情况" },
  { key: "deliveryAlerts", label: "交付预警", description: "今日应发、7 日内待发与逾期未发提醒" },
  { key: "deliveryMilestones", label: "交付里程碑", description: "底部交付里程碑样本列表" },
];

export const MULTIPLIER_OPTIONS: Array<{ key: MultiplierField; label: string; description: string }> = [
  { key: "amount", label: "金额倍率", description: "影响本期/累计合同额、回款金额、月度目标等所有金额读数" },
  { key: "customerCount", label: "客户数倍率", description: "影响客户总数、新增客户数与跟进计数" },
  { key: "contractCount", label: "合同数倍率", description: "影响新签、未付款、部分回款合同数量" },
  { key: "shipmentCount", label: "发货数倍率", description: "影响发货单数、交付台数、预警与里程碑台数" },
];

export const CONTRACT_NUMBER_MODE_OPTIONS = [
  { value: "masked", label: "遮掩显示（仅保留末尾识别字符）" },
  { value: "hidden", label: "完全隐藏（不返回合同编号）" },
] as const;

export const ADDRESS_LEVEL_OPTIONS = [
  { value: "provinceCity", label: "省份 + 城市" },
  { value: "province", label: "仅省份" },
] as const;

export const PUBLIC_DATA_NOTICE = "仅改变公开大屏显示，不修改 CRM/ERP 真实数据。";
export const SAVE_OK_NOTICE = "已保存，公开大屏将在下次刷新时生效";
export const COPY_OK_NOTICE = "已复制链接，可粘贴到大屏电脑浏览器打开";
export const COPY_FAIL_NOTICE = "复制失败，请手动复制链接";
export const SHARE_GENERATED_NOTICE = "新链接已生成";
export const SHARE_ROTATED_NOTICE = "新链接已生成，旧链接已失效";
export const SHARE_REVOKED_NOTICE = "共享链接已撤销，公开大屏已不可用";

export const ROTATE_CONFIRM_COPY = {
  title: "重新生成共享链接",
  message: "旧链接将立即失效，已打开的大屏会在下次刷新时变为「大屏不可用」，需要改用新链接。确定要重新生成吗？",
  confirmText: "重新生成",
  // 与 Web 一致：轮换会让旧链接立即失效，同样是危险操作
  danger: true,
} as const;

export const REVOKE_CONFIRM_COPY = {
  title: "撤销共享链接",
  message: "撤销后当前链接立即失效且无法恢复，所有打开中的大屏都会显示「大屏不可用」。确定要撤销吗？",
  confirmText: "撤销链接",
  danger: true,
} as const;

const MULTIPLIER_FIELDS: MultiplierField[] = ["amount", "customerCount", "contractCount", "shipmentCount"];

/** 与平台 listSettings 相同的读取归一化：非法值回退安全默认，五板块全关恢复安全状态 */
export function normalizeSalesScreenConfig(value: unknown): SalesScreenConfig {
  const defaults = DEFAULT_SALES_SCREEN_CONFIG;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return structuredClone(defaults);
  }
  const input = value as Record<string, unknown>;
  const safeBoolean = (val: unknown, fallback: boolean): boolean => (typeof val === "boolean" ? val : fallback);
  const safeNumber = (val: unknown, fallback: number): number => {
    if (typeof val !== "number" || !Number.isFinite(val)) return fallback;
    if (val < 1 || val > 100 || !Number.isInteger(val)) return fallback;
    return val;
  };
  const safeEnum = <T extends string>(val: unknown, allowed: readonly T[], fallback: T): T =>
    typeof val === "string" && (allowed as readonly string[]).includes(val) ? (val as T) : fallback;
  const section = (key: string): Record<string, unknown> => {
    const raw = input[key];
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  };
  const modules = section("modules");
  const multipliers = section("multipliers");
  const privacy = section("privacy");
  const normalizedModules = {
    operatingKpis: safeBoolean(modules.operatingKpis, defaults.modules.operatingKpis),
    deliveryMap: safeBoolean(modules.deliveryMap, defaults.modules.deliveryMap),
    collection: safeBoolean(modules.collection, defaults.modules.collection),
    deliveryAlerts: safeBoolean(modules.deliveryAlerts, defaults.modules.deliveryAlerts),
    deliveryMilestones: safeBoolean(modules.deliveryMilestones, defaults.modules.deliveryMilestones),
  };
  return {
    version: 1,
    enabled: safeBoolean(input.enabled, defaults.enabled),
    modules: Object.values(normalizedModules).some((enabled) => enabled) ? normalizedModules : { ...defaults.modules },
    multipliers: {
      amount: safeNumber(multipliers.amount, defaults.multipliers.amount),
      customerCount: safeNumber(multipliers.customerCount, defaults.multipliers.customerCount),
      contractCount: safeNumber(multipliers.contractCount, defaults.multipliers.contractCount),
      shipmentCount: safeNumber(multipliers.shipmentCount, defaults.multipliers.shipmentCount),
    },
    privacy: {
      contractNumberMode: safeEnum(privacy.contractNumberMode, ["masked", "hidden"] as const, defaults.privacy.contractNumberMode),
      addressLevel: safeEnum(privacy.addressLevel, ["province", "provinceCity"] as const, defaults.privacy.addressLevel),
      showDisplayNotice: safeBoolean(privacy.showDisplayNotice, defaults.privacy.showDisplayNotice),
    },
  };
}

/** 从 GET /api/system/settings 的 items 里取 salesScreen；行缺失时用安全默认值 */
export function findSalesScreenSetting(items: unknown): SalesScreenConfig {
  const row = Array.isArray(items)
    ? items.find((item) => !!item && typeof item === "object" && (item as { key?: unknown }).key === SALES_SCREEN_SETTING_KEY)
    : undefined;
  return normalizeSalesScreenConfig(row ? (row as { value?: unknown }).value : undefined);
}

export type SalesScreenFormState = {
  enabled: boolean;
  modules: SalesScreenConfig["modules"];
  multiplierText: Record<MultiplierField, string>;
  privacy: SalesScreenConfig["privacy"];
};

export function formFromConfig(config: SalesScreenConfig): SalesScreenFormState {
  return {
    enabled: config.enabled,
    modules: { ...config.modules },
    multiplierText: {
      amount: String(config.multipliers.amount),
      customerCount: String(config.multipliers.customerCount),
      contractCount: String(config.multipliers.contractCount),
      shipmentCount: String(config.multipliers.shipmentCount),
    },
    privacy: { ...config.privacy },
  };
}

/** 提交前体验校验：消息与平台 DomainError 文案一致 */
export function validateSalesScreenConfigForm(form: SalesScreenFormState): string | null {
  if (!Object.values(form.modules).some((enabled) => enabled)) {
    return "至少需要启用一个板块";
  }
  for (const field of MULTIPLIER_FIELDS) {
    const text = form.multiplierText[field].trim();
    const value = Number(text);
    if (!text || !Number.isFinite(value) || !Number.isInteger(value) || value < 1 || value > 100) {
      return "倍率必须是 1～100 的整数";
    }
  }
  return null;
}

export type ConfigFormParseResult = { ok: true; config: SalesScreenConfig } | { ok: false; error: string };

export function buildConfigFromForm(form: SalesScreenFormState): ConfigFormParseResult {
  const error = validateSalesScreenConfigForm(form);
  if (error) return { ok: false, error };
  const multipliers = {} as SalesScreenConfig["multipliers"];
  for (const field of MULTIPLIER_FIELDS) {
    multipliers[field] = Number(form.multiplierText[field].trim());
  }
  return {
    ok: true,
    config: { version: 1, enabled: form.enabled, modules: { ...form.modules }, multipliers, privacy: { ...form.privacy } },
  };
}

/** 共享链接 = 当前服务器 origin + 接口返回的相对路径；绝对地址只在本机拼装，不写回服务器 */
export function buildShareUrl(origin: string, path: string): string {
  const trimmedOrigin = origin.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedOrigin}${normalizedPath}`;
}

export function formatShareTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("zh-CN", { hour12: false });
}
