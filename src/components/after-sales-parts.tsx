import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { api } from "../lib/api";
import { appendAfterSalesPart, filterAfterSalesPartOptions } from "../lib/after-sales";
import { Spinner } from "./ui";

/**
 * 售后配件选择器：合同 BOM + 补充配件下拉，同时允许手输任意名称，
 * 并可把新名称通过 POST /api/after-sales/supplement-parts 存入补充配件库。
 */
export function AfterSalesPartsPicker({
  contractId,
  value,
  onChange,
  disabled = false,
}: {
  contractId?: string;
  value: string[];
  onChange: (parts: string[]) => void;
  disabled?: boolean;
}) {
  const [options, setOptions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    if (!contractId) {
      setOptions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr("");
    api<{ items: string[] }>("/api/after-sales/parts", { query: { contractId } })
      .then((result) => {
        if (requestId === requestRef.current) setOptions(result.items || []);
      })
      .catch((error) => {
        if (requestId === requestRef.current) {
          setOptions([]);
          setErr((error as Error).message);
        }
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoading(false);
      });
    return () => {
      requestRef.current += 1;
    };
  }, [contractId]);

  const mergeOption = (name: string) => {
    setOptions((current) =>
      current.includes(name) ? current : [...current, name].sort((left, right) => left.localeCompare(right, "zh-CN")),
    );
  };

  const addTyped = (partName = input) => {
    const name = partName.trim();
    if (!name || disabled) return;
    onChange(appendAfterSalesPart(value, name));
    setInput("");
    setErr("");
  };

  const addSupplement = async () => {
    const name = input.trim();
    if (!name || disabled || adding) return;
    setAdding(true);
    setErr("");
    try {
      // 平台契约：body 仅 { name }；重复时返回 409「该补充配件已存在」。
      await api("/api/after-sales/supplement-parts", { method: "POST", body: { name } });
      mergeOption(name);
      onChange(appendAfterSalesPart(value, name));
      setInput("");
    } catch (error) {
      const message = (error as Error).message || "";
      if (message.includes("已存在")) {
        mergeOption(name);
        onChange(appendAfterSalesPart(value, name));
        setInput("");
      } else {
        setErr(message || "新增补充配件失败");
      }
    } finally {
      setAdding(false);
    }
  };

  const suggestions = filterAfterSalesPartOptions(
    options.filter((option) => !value.includes(option)),
    input,
  );
  const quickOptions = options.filter((option) => !value.includes(option)).slice(0, 16);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          className="input flex-1"
          disabled={disabled}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTyped();
            }
          }}
          placeholder="搜索或手输配件名称"
        />
        <button type="button" className="btn-ghost !px-3" disabled={disabled || !input.trim()} onClick={() => addTyped()}>
          加入
        </button>
        <button
          type="button"
          className="btn-ghost !px-3"
          disabled={disabled || !input.trim() || adding}
          onClick={() => void addSupplement()}
          title="保存到补充配件库并加入本工单"
        >
          {adding ? <Spinner className="!w-4 !h-4" /> : "新增补充配件"}
        </button>
      </div>

      {input.trim() && suggestions.length > 0 && (
        <div className="panel max-h-40 overflow-y-auto">
          {suggestions.map((part) => (
            <button
              type="button"
              key={part}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-panel2"
              onClick={() => addTyped(part)}
            >
              {part}
            </button>
          ))}
        </div>
      )}

      {!input.trim() && quickOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {quickOptions.map((part) => (
            <button
              type="button"
              key={part}
              className="rounded-full border border-line px-2.5 py-0.5 text-xs text-dim hover:border-brand hover:text-brandhi"
              onClick={() => addTyped(part)}
            >
              {part}
            </button>
          ))}
        </div>
      )}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((part) => (
            <span
              key={part}
              className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-0.5 text-xs text-brandhi"
            >
              {part}
              <button
                type="button"
                className="text-faint hover:text-bad"
                disabled={disabled}
                onClick={() => onChange(value.filter((item) => item !== part))}
                title="移除"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {err && <span className="text-[11px] text-bad">{err}</span>}
      <span className="text-[11px] text-faint">
        {!contractId
          ? "可手输配件名称；选择合同后自动加载 BOM 与补充配件"
          : loading
            ? "正在加载合同 BOM 与补充配件…"
            : "可点击候选加入、手输任意名称，或保存为补充配件"}
      </span>
    </div>
  );
}
