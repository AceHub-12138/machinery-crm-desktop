// 区域（负责范围）选择器：省市数据复用 region-data.ts（全国完整地级市），保证与 sanitizeTerritories 一致
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PROVINCE_CITY_MAP, PROVINCE_OPTIONS } from "../lib/region-data";

export type Territory = { province: string; cities?: string[] };

export function TerritoryPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Territory[];
  onChange: (next: Territory[]) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const selectedMap = new Map(value.map((t) => [t.province, t.cities || []]));

  const emit = (map: Map<string, string[]>) =>
    onChange([...map.entries()].map(([province, cities]) => ({ province, cities })));

  const toggleProvince = (p: string) => {
    const next = new Map(selectedMap);
    if (next.has(p)) next.delete(p);
    else next.set(p, []);
    emit(next);
  };

  const toggleCity = (p: string, c: string) => {
    const next = new Map(selectedMap);
    const cities = next.get(p) || [];
    if (cities.includes(c)) next.set(p, cities.filter((x) => x !== c));
    else next.set(p, [...cities, c]);
    emit(next);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-dim">
        勾选省份 = 负责该省；展开后可勾选地级市（不勾市 = 负责整省）
      </p>
      <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-line bg-surface p-3">
        {PROVINCE_OPTIONS.map((p) => {
          const checked = selectedMap.has(p);
          const cityList = PROVINCE_CITY_MAP[p] || [];
          const hasCities = cityList.length > 0;
          const selCities = selectedMap.get(p) || [];

          return (
            <div key={p}>
              <div className="flex items-center gap-2">
                <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleProvince(p)}
                    className="size-4"
                  />
                  <span>{p}</span>
                  {checked && selCities.length > 0 && (
                    <span className="text-xs text-faint">
                      （已选 {selCities.length} 市）
                    </span>
                  )}
                </label>
                {hasCities && checked && (
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === p ? null : p)}
                    disabled={disabled}
                    className="text-xs text-brand transition-colors hover:text-brandhi disabled:opacity-50"
                  >
                    {expanded === p ? (
                      <>
                        <ChevronUp size={14} className="inline" /> 收起
                      </>
                    ) : (
                      <>
                        <ChevronDown size={14} className="inline" /> 选择市
                      </>
                    )}
                  </button>
                )}
              </div>
              {checked && hasCities && expanded === p && (
                <div className="ml-6 mt-2 grid grid-cols-2 gap-2 border-l-2 border-line/30 pl-3 sm:grid-cols-3">
                  {cityList.map((c) => (
                    <label
                      key={c}
                      className="flex cursor-pointer items-center gap-1.5 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={selCities.includes(c)}
                        disabled={disabled}
                        onChange={() => toggleCity(p, c)}
                        className="size-3.5"
                      />
                      <span>{c}</span>
                    </label>
                  ))}
                  <div className="col-span-2 mt-1 text-[11px] text-faint sm:col-span-3">
                    不勾选任何市 = 负责整省
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
