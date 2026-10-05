// 平台枚举的中文显示与格式化工具

export const CUSTOMER_STATUS: Record<string, { label: string; tone: string }> = {
  NEW_LEAD: { label: "新线索", tone: "text-dim bg-steel/25" },
  CONTACTED: { label: "已联系", tone: "text-warn bg-warn/10" },
  QUOTED: { label: "已报价", tone: "text-brandhi bg-brand/10" },
  NEGOTIATING: { label: "谈判中", tone: "text-brandhi bg-brand/15" },
  WON: { label: "已成交", tone: "text-ok bg-ok/10" },
  LOST: { label: "已流失", tone: "text-bad bg-bad/10" },
  INACTIVE: { label: "暂停跟进", tone: "text-faint bg-steel/20" },
};

export const CUSTOMER_LEVEL: Record<string, string> = { A: "A 级", B: "B 级", C: "C 级", D: "D 级" };

export const PAYMENT_STATUS: Record<string, { label: string; tone: string }> = {
  UNPAID: { label: "未回款", tone: "text-bad bg-bad/10" },
  PARTIAL_PAID: { label: "部分回款", tone: "text-warn bg-warn/10" },
  PAID: { label: "已回款", tone: "text-ok bg-ok/10" },
};

export const CONTRACT_STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "已做合同", tone: "text-dim bg-steel/25" },
  SIGNED: { label: "已签订", tone: "text-brandhi bg-brand/10" },
  COMPLETED: { label: "已完成", tone: "text-ok bg-ok/10" },
  CANCELLED: { label: "已取消", tone: "text-bad bg-bad/10" },
  ARCHIVED: { label: "已归档", tone: "text-faint bg-steel/20" },
};

export const SHIPMENT_STATUS: Record<string, { label: string; tone: string }> = {
  NOT_SHIPPED: { label: "未发货", tone: "text-dim bg-steel/25" },
  PARTIAL_SHIPPED: { label: "部分发货", tone: "text-warn bg-warn/10" },
  SHIPPED: { label: "已发货", tone: "text-ok bg-ok/10" },
};

export const FOLLOW_TYPE: Record<string, string> = {
  PHONE: "电话",
  WECHAT: "微信",
  EMAIL: "邮件",
  WHATSAPP: "WhatsApp",
  VIDEO: "视频会议",
  VISIT: "到厂拜访",
  EXHIBITION: "展会",
  OTHER: "其他",
};

export const CUSTOMER_TYPE: Record<string, string> = {
  NEW: "新客户",
  OLD: "老客户",
  AGENT: "代理商",
  END_USER: "终端用户",
  DISTRIBUTOR: "经销商",
};

export const CUSTOMER_SOURCES = ["展会", "阿里巴巴", "官网", "抖音", "微信", "老客户介绍", "电话开发", "外贸询盘", "其他"] as const;

export const PAYMENT_METHODS = ["银行转账", "现金", "微信", "支付宝", "承兑", "其他"] as const;

export const CURRENCIES: Record<string, string> = { CNY: "人民币", USD: "美元", EUR: "欧元" };

/** 全国省级行政区（与平台 PROVINCE_OPTIONS 一致，末位"国外"为特殊项） */
export const PROVINCE_OPTIONS = [
  "北京市", "天津市", "河北省", "山西省", "内蒙古自治区", "辽宁省", "吉林省", "黑龙江省",
  "上海市", "江苏省", "浙江省", "安徽省", "福建省", "江西省", "山东省", "河南省",
  "湖北省", "湖南省", "广东省", "广西壮族自治区", "海南省", "重庆市", "四川省", "贵州省",
  "云南省", "西藏自治区", "陕西省", "甘肃省", "青海省", "宁夏回族自治区", "新疆维吾尔自治区", "国外",
] as const;

export const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "超级管理员",
  SALES: "销售",
  FOREIGN_TRADE: "外贸业务",
  PURCHASE: "采购",
  WAREHOUSE: "仓库管理",
};

export const PRODUCT_TYPE: Record<string, string> = {
  MAIN: "主产品",
  OPTIONAL: "选配项",
};

export const AFTER_SALES_TYPE: Record<string, string> = {
  NEW_MACHINE_DEBUG: "新机调试",
  AFTER_SALES_REPAIR: "售后维修",
  IN_WARRANTY_SERVICE: "质保内服务",
  OUT_WARRANTY_PAID: "质保外有偿服务",
};

export const AFTER_SALES_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING_DISPATCH: { label: "待派发", tone: "text-warn bg-warn/10" },
  DISPATCHED: { label: "已派发", tone: "text-dim bg-steel/25" },
  IN_PROGRESS: { label: "处理中", tone: "text-brandhi bg-brand/10" },
  COMPLETED: { label: "已完成", tone: "text-ok bg-ok/10" },
  CLOSED: { label: "已关闭", tone: "text-faint bg-steel/20" },
};

export const URGENCY: Record<string, { label: string; tone: string }> = {
  NORMAL: { label: "普通", tone: "text-dim bg-steel/25" },
  URGENT: { label: "紧急", tone: "text-bad bg-bad/15" },
};

export const PROBLEM_CATEGORY: Record<string, string> = {
  MECHANICAL: "机械故障",
  ELECTRICAL: "电气故障",
  SOFTWARE: "软件系统",
  PRECISION: "精度问题",
  OPERATION: "操作不当",
  WEAR_PARTS: "易损件损耗",
  OTHER: "其他",
};

export const SATISFACTION: Record<string, { label: string; tone: string }> = {
  SATISFIED: { label: "满意", tone: "text-ok bg-ok/10" },
  AVERAGE: { label: "一般", tone: "text-warn bg-warn/10" },
  UNSATISFIED: { label: "不满意", tone: "text-bad bg-bad/10" },
};

export const LEAD_SOURCE: Record<string, string> = {
  BAIDU_SEARCH: "百度搜索",
  MANUAL: "手工录入",
  OTHER: "其他来源",
};

export const LEAD_REVIEW: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "待复核", tone: "text-dim bg-steel/25" },
  HIGH_INTENT: { label: "高意向", tone: "text-ok bg-ok/10" },
  MID_INTENT: { label: "中意向", tone: "text-warn bg-warn/10" },
  LOW_INTENT: { label: "低意向", tone: "text-dim bg-steel/25" },
  INVALID: { label: "无效", tone: "text-bad bg-bad/10" },
};

export function label(map: Record<string, any>, key?: string | null) {
  if (!key) return "—";
  const value = map[key];
  // 支持 {label, tone} 对象和直接的字符串映射
  return typeof value === "object" && value?.label ? value.label : (typeof value === "string" ? value : key);
}

export function pillTone(map: Record<string, any>, key?: string | null) {
  if (!key) return "text-dim bg-steel/25";
  return map[key]?.tone ?? "text-dim bg-steel/25";
}

export function money(value: unknown, currency = "CNY"): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "—";
  const symbol = currency === "CNY" ? "¥" : currency === "USD" ? "$" : currency === "EUR" ? "€" : "";
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}${symbol}${formatted}`;
}

/** 大数字缩写：KPI 卡片用 */
export function moneyShort(value: unknown): string {
  const n = Number(value ?? 0);
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${(n / 1e8).toFixed(2)} 亿`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(1)} 万`;
  return n.toLocaleString("zh-CN");
}

/** 全金额（整数、千分位、币种前缀）：工作台重点卡片用；过亿自动回落缩写防溢出 */
export function moneyFull(value: unknown, currency: string = "CNY"): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e8) return moneyShort(n);
  const symbol = currency === "CNY" ? "¥" : currency === "USD" ? "$" : currency === "EUR" ? "€" : "";
  return `${symbol}${Math.round(n).toLocaleString("zh-CN")}`;
}

export function date(value: unknown): string {
  if (!value) return "—";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dateTime(value: unknown): string {
  if (!value) return "—";
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${date(value)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function relativeTime(value: unknown): string {
  if (!value) return "";
  const t = new Date(value as string).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return date(value);
}
