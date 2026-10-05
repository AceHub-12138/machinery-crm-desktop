import { useEffect, useState } from "react";
import { AlertTriangle, Save } from "lucide-react";
import { api, getCachedUser } from "../lib/api";
import { Spinner, showToast } from "../components/ui";
import { SalesScreenConfigSections } from "../components/sales-screen-config";
import type { SettingRow } from "../types";

/** 平台契约：与网页端配置中心一致。白名单：单据编号规则 + 售后预警线 + 售后打印文字。
 * 连接串/密钥/服务器控制类配置平台一律不提供，此处不做（平台页明文声明）。 */

const ORDER_KINDS = ["PURCHASE_ORDER", "STOCK_CHECK", "STOCK_TRANSFER", "STOCK_OUT", "AFTER_SALES_ORDER"] as const;
const ORDER_LABELS: Record<(typeof ORDER_KINDS)[number], string> = {
  PURCHASE_ORDER: "采购订单",
  STOCK_CHECK: "盘点单",
  STOCK_TRANSFER: "库存调拨单",
  STOCK_OUT: "出库单",
  AFTER_SALES_ORDER: "售后工单",
};

// 与平台 src/lib/after-sales.ts 的 AFTER_SALES_ORDER_TYPES / DEFAULT_AFTER_SALES_ALERT_DAYS 对齐。
// 键名不匹配时平台写入会按默认值归一化，前端表现为"保存成功但没生效"。
const ALERT_ORDER_TYPES = ["NEW_MACHINE_DEBUG", "AFTER_SALES_REPAIR", "IN_WARRANTY_SERVICE", "OUT_WARRANTY_PAID"] as const;
const ALERT_TYPE_LABELS: Record<(typeof ALERT_ORDER_TYPES)[number], string> = {
  NEW_MACHINE_DEBUG: "新机调试",
  AFTER_SALES_REPAIR: "售后维修",
  IN_WARRANTY_SERVICE: "质保内服务",
  OUT_WARRANTY_PAID: "质保外有偿服务",
};
const DEFAULT_ALERT_DAYS: Record<(typeof ALERT_ORDER_TYPES)[number], number> = {
  NEW_MACHINE_DEBUG: 3,
  AFTER_SALES_REPAIR: 5,
  IN_WARRANTY_SERVICE: 5,
  OUT_WARRANTY_PAID: 7,
};

const DOCUMENT_RULES_KEY = "documentNumberRules";

interface RuleItem {
  prefix: string;
  sequenceLength: number;
  separator: string;
}

type DocumentRules = Record<(typeof ORDER_KINDS)[number], RuleItem>;

interface Reminders {
  afterSalesAlertDays: Partial<Record<(typeof ALERT_ORDER_TYPES)[number], number>>;
}

interface PrintInfo {
  afterSalesPrintInfo: {
    companyName: string;
    contactAddress: string;
    footerNote: string;
  };
}

// 平台 DEFAULT_AUTO_DOCUMENT_RULES：前缀/位数/分隔符必须一致，否则首次保存会把平台规则写坏
const DEFAULT_RULES: DocumentRules = {
  PURCHASE_ORDER: { prefix: "PO", sequenceLength: 3, separator: "" },
  STOCK_CHECK: { prefix: "CK", sequenceLength: 3, separator: "" },
  STOCK_TRANSFER: { prefix: "TR", sequenceLength: 3, separator: "" },
  STOCK_OUT: { prefix: "CH", sequenceLength: 3, separator: "" },
  AFTER_SALES_ORDER: { prefix: "SH", sequenceLength: 3, separator: "-" },
};

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand";

export default function AdminConfigView() {
  const user = getCachedUser();
  const isAdmin = user?.role === "SUPER_ADMIN";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [rules, setRules] = useState<DocumentRules>(DEFAULT_RULES);
  const [savingRules, setSavingRules] = useState(false);
  const [rulesSavedOnce, setRulesSavedOnce] = useState(false);

  const [reminders, setReminders] = useState<Reminders>({ afterSalesAlertDays: {} });
  const [savingReminders, setSavingReminders] = useState(false);
  const [remindersSavedOnce, setRemindersSavedOnce] = useState(false);

  const [printInfo, setPrintInfo] = useState<PrintInfo["afterSalesPrintInfo"]>({
    companyName: "",
    contactAddress: "",
    footerNote: "",
  });
  const [savingPrint, setSavingPrint] = useState(false);
  const [printSavedOnce, setPrintSavedOnce] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const data = await api<{ items: SettingRow[] }>("/api/system/settings");
        const rows = Array.isArray(data?.items) ? data.items : [];
        const ruleRow = rows.find((row) => row.key === DOCUMENT_RULES_KEY);
        if (ruleRow?.value && typeof ruleRow.value === "object") {
          setRules((current) => {
            const next: DocumentRules = { ...current };
            for (const kind of ORDER_KINDS) {
              const raw = (ruleRow.value as Record<string, unknown>)[kind];
              if (raw && typeof raw === "object") {
                const item = raw as Partial<RuleItem>;
                next[kind] = {
                  prefix: typeof item.prefix === "string" ? item.prefix : current[kind].prefix,
                  sequenceLength: typeof item.sequenceLength === "number" && item.sequenceLength >= 1 ? item.sequenceLength : current[kind].sequenceLength,
                  separator: typeof item.separator === "string" ? item.separator : current[kind].separator,
                };
              }
            }
            return next;
          });
        }
        const reminderRow = rows.find((row) => row.key === "reminders");
        if (reminderRow?.value && typeof reminderRow.value === "object") {
          const raw = (reminderRow.value as { afterSalesAlertDays?: unknown }).afterSalesAlertDays;
          if (raw && typeof raw === "object") setReminders({ afterSalesAlertDays: raw as Reminders["afterSalesAlertDays"] });
        }
        const printRow = rows.find((row) => row.key === "printInfo");
        if (printRow?.value && typeof printRow.value === "object") {
          const raw = (printRow.value as { afterSalesPrintInfo?: unknown }).afterSalesPrintInfo;
          if (raw && typeof raw === "object") {
            const p = raw as Partial<PrintInfo["afterSalesPrintInfo"]>;
            setPrintInfo({
              companyName: typeof p.companyName === "string" ? p.companyName : "",
              contactAddress: typeof p.contactAddress === "string" ? p.contactAddress : "",
              footerNote: typeof p.footerNote === "string" ? p.footerNote : "",
            });
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "配置加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin]);

  const saveRules = async () => {
    setSavingRules(true);
    try {
      const value: Record<string, RuleItem> = {};
      for (const kind of ORDER_KINDS) value[kind] = rules[kind];
      await api("/api/system/settings", { method: "PUT", body: { key: DOCUMENT_RULES_KEY, value } });
      setRulesSavedOnce(true);
      showToast("编号规则已保存", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存编号规则失败", "error");
    } finally {
      setSavingRules(false);
    }
  };

  const saveReminders = async () => {
    setSavingReminders(true);
    try {
      await api("/api/system/settings", { method: "PUT", body: { key: "reminders", value: reminders } });
      setRemindersSavedOnce(true);
      showToast("预警线已保存", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存预警线失败", "error");
    } finally {
      setSavingReminders(false);
    }
  };

  const savePrintInfo = async () => {
    setSavingPrint(true);
    try {
      await api("/api/system/settings", { method: "PUT", body: { key: "printInfo", value: { afterSalesPrintInfo: printInfo } } });
      setPrintSavedOnce(true);
      showToast("打印文字已保存", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存打印文字失败", "error");
    } finally {
      setSavingPrint(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="rounded-2xl border border-line bg-panel p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 size-12 text-amber-500" />
          <p className="text-sm text-bad">无权访问系统配置</p>
          <p className="mt-2 text-xs text-faint">仅超级管理员可访问此功能</p>
        </div>
      </div>
    );
  }

  const SaveButton = ({
    onClick,
    busy,
    done,
    label,
  }: {
    onClick: () => void;
    busy: boolean;
    done: boolean;
    label: string;
  }) => (
    <button
      onClick={onClick}
      disabled={busy}
      className={`mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        done ? "bg-good hover:opacity-90" : "bg-brand hover:bg-brandhi"
      }`}
    >
      {busy ? <Spinner className="!h-4 !w-4" /> : <Save size={16} />}
      {busy ? "保存中..." : done ? `${label}（已生效）` : label}
    </button>
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-4xl space-y-5">
          {/* 页面标题 */}
          <div>
            <h1 className="text-2xl font-semibold text-ink">系统配置</h1>
            <p className="mt-1 text-sm text-dim">
              白名单业务配置（对接 /api/system/settings）；连接串、密码、Token、密钥和服务器控制均不在此展示
            </p>
          </div>

          {error && <div className="rounded-2xl border border-bad/40 bg-bad/5 p-4 text-sm text-bad">{error}</div>}

          {loading ? (
            <div className="rounded-2xl border border-line bg-panel p-8">
              <p className="text-center text-sm text-dim">加载中…</p>
            </div>
          ) : (
            <>
              {/* 自动单据编号规则 */}
              <section className="space-y-4 rounded-2xl border border-line bg-panel p-6 shadow-sm">
                <div>
                  <h2 className="text-base font-semibold text-ink">自动单据编号</h2>
                  <p className="mt-1 text-xs text-dim">
                    可修改前缀、流水位数、分隔符；日期固定 yyyyMMdd 按日重置。出库单可手工填单号，留空时按本规则生成。
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-faint">
                        <th className="pb-2 pr-4 font-medium">单据</th>
                        <th className="pb-2 pr-4 font-medium">前缀</th>
                        <th className="pb-2 pr-4 font-medium">日期</th>
                        <th className="pb-2 pr-4 font-medium">流水位数</th>
                        <th className="pb-2 font-medium">分隔符</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ORDER_KINDS.map((kind) => (
                        <tr key={kind} className="border-t border-line/60">
                          <td className="py-2.5 pr-4 text-ink">{ORDER_LABELS[kind]}</td>
                          <td className="py-2.5 pr-4">
                            <input
                              className="w-24 rounded-xl border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                              value={rules[kind].prefix}
                              onChange={(e) => setRules({ ...rules, [kind]: { ...rules[kind], prefix: e.target.value } })}
                            />
                          </td>
                          <td className="py-2.5 pr-4 text-dim">yyyyMMdd</td>
                          <td className="py-2.5 pr-4">
                            <input
                              type="number"
                              min={1}
                              max={8}
                              className="w-20 rounded-xl border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                              value={rules[kind].sequenceLength}
                              onChange={(e) =>
                                setRules({ ...rules, [kind]: { ...rules[kind], sequenceLength: Math.max(1, Math.min(8, Number(e.target.value) || 1)) } })
                              }
                            />
                          </td>
                          <td className="py-2.5">
                            <input
                              className="w-20 rounded-xl border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                              value={rules[kind].separator}
                              onChange={(e) => setRules({ ...rules, [kind]: { ...rules[kind], separator: e.target.value } })}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <SaveButton onClick={() => void saveRules()} busy={savingRules} done={rulesSavedOnce} label="保存编号规则" />
              </section>

              {/* 售后超时预警线 + 打印文字 */}
              <section className="space-y-6 rounded-2xl border border-line bg-panel p-6 shadow-sm">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">售后超时预警线（天）</h3>
                    <p className="mt-1 text-xs text-dim">紧急工单自动按对应天数的一半向下取整，至少 1 天。留空使用默认值。</p>
                    <div className="mt-3 space-y-2">
                      {ALERT_ORDER_TYPES.map((type) => (
                        <label key={type} className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-dim">{ALERT_TYPE_LABELS[type]}</span>
                          <input
                            type="number"
                            min={1}
                            max={365}
                            className="w-20 rounded-xl border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                            value={reminders.afterSalesAlertDays[type] ?? DEFAULT_ALERT_DAYS[type]}
                            onChange={(e) =>
                              setReminders({
                                afterSalesAlertDays: {
                                  ...reminders.afterSalesAlertDays,
                                  [type]: Math.max(1, Math.min(365, Number(e.target.value) || DEFAULT_ALERT_DAYS[type])),
                                },
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <SaveButton onClick={() => void saveReminders()} busy={savingReminders} done={remindersSavedOnce} label="保存预警线" />
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-ink">售后工单打印文字</h3>
                    <div className="mt-3 space-y-3">
                      <label className="block text-sm text-dim">
                        公司抬头名称
                        <input
                          className={`mt-1 ${inputClass}`}
                          value={printInfo.companyName}
                          onChange={(e) => setPrintInfo({ ...printInfo, companyName: e.target.value })}
                        />
                      </label>
                      <label className="block text-sm text-dim">
                        联系电话 / 地址落款
                        <input
                          className={`mt-1 ${inputClass}`}
                          value={printInfo.contactAddress}
                          onChange={(e) => setPrintInfo({ ...printInfo, contactAddress: e.target.value })}
                        />
                      </label>
                      <label className="block text-sm text-dim">
                        页脚备注语
                        <input
                          className={`mt-1 ${inputClass}`}
                          value={printInfo.footerNote}
                          onChange={(e) => setPrintInfo({ ...printInfo, footerNote: e.target.value })}
                        />
                      </label>
                    </div>
                    <SaveButton onClick={() => void savePrintInfo()} busy={savingPrint} done={printSavedOnce} label="保存打印文字" />
                  </div>
                </div>
              </section>

              {/* 展厅大屏配置 + 共享链接（与 Web 配置中心同契约同文案） */}
              <SalesScreenConfigSections />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
