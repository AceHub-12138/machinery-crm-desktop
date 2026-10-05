import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { SearchSelect, Sheet, Spinner, notify } from "./ui";
import { buildQuotePayload, quoteLineAmount, QUOTE_MAIN_PRICE_ERROR } from "../lib/quotes";
import { moneyFull } from "../lib/format";
import type { CustomerRow, ProductRow } from "../types";

interface QuoteLine {
  productId: string;
  quotedPrice: string;
  quantity: string;
}

const blankLine = (): QuoteLine => ({ productId: "", quotedPrice: "", quantity: "1" });

/** 新建报价：主产品 + 选配产品，与平台「新增报价」表单口径一致（合计由明细汇总） */
export function QuoteFormSheet({ customer, onClose, onSaved }: { customer: CustomerRow; onClose: () => void; onSaved: () => void }) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [mains, setMains] = useState<QuoteLine[]>([blankLine()]);
  const [optionals, setOptionals] = useState<QuoteLine[]>([]);
  const [currency, setCurrency] = useState("CNY");
  const [remark, setRemark] = useState("");
  const [error, setError] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api<ProductRow[]>("/api/products")
      .then((result) => {
        if (active) setProducts(Array.isArray(result) ? result : []);
      })
      .catch((loadError) => {
        if (active) setLoadErr((loadError as Error).message);
      });
    return () => {
      active = false;
    };
  }, []);

  const mainProducts = products.filter((product) => product.productType === "MAIN");
  const optionalProducts = products.filter((product) => product.productType === "OPTIONAL");
  const amountOf = (line: QuoteLine) => quoteLineAmount({ quotedPrice: line.quotedPrice, quantity: line.quantity });
  const total = [...mains, ...optionals].reduce((sum, line) => sum + amountOf(line), 0);

  const update = (list: "main" | "optional", index: number, patch: Partial<QuoteLine>) => {
    const setter = list === "main" ? setMains : setOptionals;
    setter((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };
  const pickProduct = (list: "main" | "optional", index: number, productId: string) => {
    const pool = list === "main" ? mainProducts : optionalProducts;
    const product = pool.find((item) => item.id === productId);
    update(list, index, {
      productId,
      quotedPrice: product?.factoryPrice == null ? "" : String(Number(product.factoryPrice)),
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError("");
    if (mains.some((line) => !line.productId)) {
      setError("请为每条主产品选择产品（不需要的行可删除）");
      return;
    }
    if (mains.some((line) => line.quotedPrice === "")) {
      setError(QUOTE_MAIN_PRICE_ERROR);
      return;
    }
    if (optionals.some((line) => !line.productId)) {
      setError("选配产品有未选择的行，请补全或删除");
      return;
    }
    setSaving(true);
    try {
      await api("/api/customer-quotes", {
        method: "POST",
        body: buildQuotePayload({ customerId: customer.id, currency, remark, mains, optionals }),
      });
      notify("报价已创建");
      onSaved();
      onClose();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const renderLines = (list: "main" | "optional", lines: QuoteLine[]) => (
    <div className="flex flex-col gap-2">
      {lines.map((line, index) => (
        <div className="panel px-3 py-2.5" key={`${list}-${index}`}>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <SearchSelect
                value={line.productId}
                onChange={(value) => pickProduct(list, index, value)}
                placeholder={list === "main" ? `请选择产品 ${index + 1}` : "请选择选配件"}
                searchPlaceholder="搜索型号"
                options={(list === "main" ? mainProducts : optionalProducts).map((product) => ({
                  value: product.id,
                  label: product.model,
                  sub: product.category,
                }))}
              />
            </div>
            <button
              type="button"
              className="btn-ghost !px-2 !py-1.5 text-xs text-bad"
              title="删除该行"
              onClick={() =>
                list === "main"
                  ? setMains((prev) => prev.filter((_, i) => i !== index))
                  : setOptionals((prev) => prev.filter((_, i) => i !== index))
              }
            >
              <Trash2 size={13} />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1">
              <span className="label">{list === "main" ? "产品报价" : "选配报价"}</span>
              <input
                className="input mono"
                type="number"
                min="0"
                step="0.01"
                value={line.quotedPrice}
                onChange={(event) => update(list, index, { quotedPrice: event.target.value })}
                placeholder="单价"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">数量</span>
              <input
                className="input mono"
                type="number"
                min="1"
                step="1"
                value={line.quantity}
                onChange={(event) => update(list, index, { quantity: event.target.value })}
                placeholder="1"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="label">小计</span>
              <span className="mono flex h-9 items-center text-brandhi">{moneyFull(amountOf(line), currency)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <Sheet title="新增报价" subtitle={customer.companyName} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {loadErr && <div className="text-xs text-bad">产品数据加载失败：{loadErr}</div>}
        {error && <div className="text-xs text-bad">{error}</div>}

        <div className="rounded-xl bg-panel2 px-3 py-2 text-xs text-dim">
          合计：<span className="mono text-base font-semibold text-brandhi">{moneyFull(total, currency)}</span>
          <span className="ml-2 text-faint">（由明细自动汇总，与平台一致）</span>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label">产品明细 *（可添加多个）</span>
            <button type="button" className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => setMains((prev) => [...prev, blankLine()])}>
              <Plus size={13} /> 添加产品
            </button>
          </div>
          {renderLines("main", mains)}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label">选配产品</span>
            <button type="button" className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => setOptionals((prev) => [...prev, blankLine()])}>
              <Plus size={13} /> 添加选配
            </button>
          </div>
          {optionals.length ? renderLines("optional", optionals) : <p className="text-xs text-faint">未添加选配产品</p>}
        </div>

        <label className="flex flex-col gap-1">
          <span className="label">币种</span>
          <select className="input" value={currency} onChange={(event) => setCurrency(event.target.value)}>
            {["CNY", "USD", "EUR"].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="label">备注</span>
          <textarea className="input" rows={3} value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="报价备注" />
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn-brand" disabled={saving}>
            {saving ? <Spinner className="!h-4 !w-4" /> : "保存报价"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
