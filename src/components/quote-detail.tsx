import { FileText, Link2, Lock, RefreshCw } from "lucide-react";
import { Sheet, Pill, Field, Dash, Spinner } from "./ui";
import { CONTRACT_STATUS, dateTime, label, money, moneyFull, pillTone } from "../lib/format";
import { quoteSummary } from "../lib/quotes";
import type { CustomerQuoteRow, QuoteContractLink } from "../types";

/** 报价详情：明细（产品/选配）+ 合计 + 关联合同，并提供「一键转合同」入口 */
export function QuoteDetailSheet({
  quote,
  link,
  busy,
  onClose,
  onConvert,
  onOpenContract,
}: {
  quote: CustomerQuoteRow;
  /** GET /api/customer-quotes/{id}/contract 的结果；未加载完为 null */
  link: QuoteContractLink | null;
  busy: boolean;
  onClose: () => void;
  onConvert: () => void;
  onOpenContract?: (contractId: string) => void;
}) {
  const summary = quoteSummary(quote);
  const currency = quote.currency || "CNY";
  const linked = link?.contract || null;
  const locked = link?.locked === true;

  return (
    <Sheet
      title="报价详情"
      subtitle={`${quoteByIdLabel(quote)} · ${dateTime(quote.createdAt)}${quote.createdBy?.name ? ` · ${quote.createdBy.name}` : ""}`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <div className="panel panel-glow flex items-end justify-between px-4 py-3">
          <div>
            <div className="label">报价合计</div>
            <div className="mono mt-1 text-xl font-semibold text-brandhi">{moneyFull(summary.total, currency)}</div>
          </div>
          <div className="text-right text-xs text-faint">
            <div>主产品 {summary.mainCount} 项 · 选配 {summary.optionalCount} 项</div>
            <div className="mt-1">币种 {currency}</div>
          </div>
        </div>

        <div>
          <div className="label mb-2 flex items-center gap-1.5">
            <FileText size={12} /> 产品明细（{summary.breakdown.length}）
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="th">类型</th>
                  <th className="th">产品</th>
                  <th className="th">单价 × 数量</th>
                  <th className="th">小计</th>
                  <th className="th">出厂价</th>
                </tr>
              </thead>
              <tbody>
                {summary.breakdown.map((item) => (
                  <tr key={item.key}>
                    <td className="td">
                      <Pill tone={item.itemType === "MAIN" ? "text-brandhi bg-brand/10" : "text-dim bg-steel/25"}>{item.itemLabel}</Pill>
                    </td>
                    <td className="td">
                      <div>{item.name || <Dash />}</div>
                      {item.model && <div className="mono text-xs text-faint">{item.model}</div>}
                    </td>
                    <td className="td mono whitespace-nowrap">
                      {money(item.unitPrice, currency)} × {item.quantity}
                    </td>
                    <td className="td mono whitespace-nowrap text-brandhi">{money(item.subtotal, currency)}</td>
                    <td className="td mono whitespace-nowrap text-faint">
                      {item.factoryPrice == null ? <Dash /> : money(item.factoryPrice, currency)}
                    </td>
                  </tr>
                ))}
                {summary.breakdown.length === 0 && (
                  <tr>
                    <td className="td text-xs text-faint" colSpan={5}>
                      该报价没有明细记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Field label="备注">
          <span className="text-dim">{quote.remark || <Dash />}</span>
        </Field>

        <div className="panel px-3.5 py-3">
          <div className="label flex items-center gap-1.5">
            <Link2 size={12} /> 关联合同
          </div>
          {link === null ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-faint">
              <Spinner className="!h-3.5 !w-3.5" /> 正在查询…
            </div>
          ) : linked ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                className="mono text-brandhi hover:underline"
                onClick={() => onOpenContract?.(linked.id)}
                disabled={!onOpenContract}
              >
                {linked.contractNo}
              </button>
              {linked.contractStatus && <Pill tone={pillTone(CONTRACT_STATUS, linked.contractStatus)}>{label(CONTRACT_STATUS, linked.contractStatus)}</Pill>}
              {linked.amount != null && <span className="mono text-faint">合同金额 {money(linked.amount, currency)}</span>}
              {locked && <span className="text-warn">该合同已锁定，更新需先申请解锁</span>}
            </div>
          ) : (
            <p className="mt-2 text-xs text-faint">尚未生成合同，可点「一键转合同」按报价创建。</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {locked && <span className="mr-auto flex items-center gap-1 text-xs text-warn"><Lock size={12} />当前合同已锁定，如需修改，请联系超级管理员审批。</span>}
          <button type="button" className="btn-ghost" onClick={onClose}>
            关闭
          </button>
          <button type="button" className="btn-brand" disabled={busy || link === null || locked} onClick={onConvert}>
            {busy ? <Spinner className="!h-4 !w-4" /> : <RefreshCw size={13} />}
            {linked ? "用报价更新合同" : "一键转合同"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function quoteByIdLabel(quote: CustomerQuoteRow): string {
  const model = quote.product?.model;
  return model ? `主产品 ${model}` : `报价 ${quote.id.slice(0, 8)}`;
}
