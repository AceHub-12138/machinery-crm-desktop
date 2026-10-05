import { useEffect, useMemo, useRef, useState } from "react";
import { FileDown, Upload } from "lucide-react";
import { api, uploadFile } from "../../lib/api";
import { Spinner, SearchSelect, showToast } from "../../components/ui";
import { flattenCategories } from "../../lib/erp";
import type { ErpMaterialCategoryRow, ErpMaterialRow } from "../../types";

/** 与平台 material-import-dialog.tsx 相同的模板表头（10 列） */
const TEMPLATE_HEADERS = ["物料编号/图号", "物料名称", "物料分类", "规格型号", "材质", "单位", "标准单价", "安全库存", "备注", "是否启用"];

/** 生成《物料导入模板.xlsx》并走原生另存为落盘（xlsx 对齐平台实现） */
export async function downloadMaterialImportTemplate() {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([
    TEMPLATE_HEADERS,
    ["JSCJ-0001", "底座", "机身铸件", "HT250", "铸铁", "件", 0, 0, "示例行，可删除", "是"],
    ["", "缺少图号示例", "外购件", "M12", "45钢", "件", 0, 0, "预览时需选择处理方式", "是"],
  ]);
  sheet["!cols"] = TEMPLATE_HEADERS.map(() => ({ wch: 18 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "物料导入模板");
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const result = await window.dachuan.saveFile({ name: "物料导入模板.xlsx", base64, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  if (!result.saved && result.error) showToast(result.error, "error");
  else if (result.saved) showToast(`已保存：${result.filePath}`);
}

export interface ImportPreviewRow {
  rowNumber: number;
  code: string;
  name: string;
  categoryId: string;
  categoryName: string;
  spec: string;
  materialType: string;
  unit: string;
  standardPrice: string;
  safetyStock: string;
  remark: string;
  isActive: boolean;
  status: "CREATE" | "UPDATE" | "MISSING_CODE" | "ERROR";
  actionLabel: string;
  error: string;
  existingMaterialId: string;
  suggestedMatches: ErpMaterialRow[];
}

export interface ImportSummary {
  create: number;
  update: number;
  missingCode: number;
  error: number;
  total: number;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  revived?: number;
  errorMessages: string[];
  generatedCodes: Array<{ rowNumber: number; code: string }>;
}

export interface ImportResolution {
  action?: "UPDATE_EXISTING" | "AUTO_CODE_CREATE" | "SKIP";
  materialId?: string;
  categoryId?: string;
}

const STATUS_TONE: Record<ImportPreviewRow["status"], string> = {
  CREATE: "text-ok bg-ok/10",
  UPDATE: "text-brandhi bg-brand/10",
  MISSING_CODE: "text-warn bg-warn/10",
  ERROR: "text-bad bg-bad/10",
};

/** Excel 导入物料：两步走（multipart 预览 → JSON confirm），缺图号行需选择处理方式 */
export function MaterialImportDialog({
  categories,
  onClose,
  onImported,
}: {
  categories: ErpMaterialCategoryRow[];
  onClose: () => void;
  onImported: () => void | Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [materials, setMaterials] = useState<ErpMaterialRow[]>([]);
  const [rows, setRows] = useState<ImportPreviewRow[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, ImportResolution>>({});
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const flatCategories = useMemo(() => flattenCategories(categories), [categories]);
  const unresolvedRows = rows.filter((row) => row.status === "MISSING_CODE" && !resolutions[String(row.rowNumber)]?.action);

  useEffect(() => {
    api<ErpMaterialRow[]>("/api/erp/materials")
      .then((data) => setMaterials(Array.isArray(data) ? data : []))
      .catch(() => setMaterials([]));
  }, []);

  const preview = async () => {
    if (!file) return;
    setLoading(true);
    setMessage("");
    setResult(null);
    setRows([]);
    setSummary(null);
    setResolutions({});
    try {
      const payload = await uploadFile<{ rows?: ImportPreviewRow[]; summary?: ImportSummary }>("/api/erp/materials/import", file, { intent: "preview" });
      setRows(payload.rows || []);
      setSummary(payload.summary || null);
    } catch (err) {
      setMessage((err as Error).message || "预览失败");
    } finally {
      setLoading(false);
    }
  };

  const confirmImport = async () => {
    setConfirming(true);
    setMessage("");
    try {
      const payload = await api<ImportResult>("/api/erp/materials/import", {
        method: "POST",
        body: { intent: "confirm", rows, resolutions },
      });
      setResult(payload);
      await onImported();
    } catch (err) {
      setMessage((err as Error).message || "导入失败");
    } finally {
      setConfirming(false);
    }
  };

  const materialOptions = useMemo(() => {
    const seen = new Set<string>();
    return materials
      .filter((material) => {
        if (seen.has(material.id)) return false;
        seen.add(material.id);
        return true;
      })
      .map((material) => ({ value: material.id, label: `${material.code} · ${material.name}`, sub: material.spec || undefined }));
  }, [materials]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-panel2/50 p-3">
        <p className="text-xs leading-5 text-faint">
          只导入物料基础信息，不修改库存数量，不生成出入库流水。分类列按「分类名称」匹配；
          图号/编号留空的行需要在预览后选择处理方式（更新已有物料 / 按分类自动编号新增 / 跳过）。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          <button className="btn-ghost text-xs" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} />
            {file ? file.name : "选择 Excel 文件"}
          </button>
          <button className="btn-ghost text-xs" onClick={() => void downloadMaterialImportTemplate()}>
            <FileDown size={14} />
            下载模板
          </button>
          <button className="btn-brand !py-1.5 text-xs" disabled={!file || loading} onClick={() => void preview()}>
            {loading ? <Spinner className="!h-3.5 !w-3.5" /> : "预览导入"}
          </button>
        </div>
      </div>

      {message && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad">{message}</p>}

      {summary && (
        <div className="grid grid-cols-2 gap-2 text-center md:grid-cols-5">
          <SummaryCard label="新增" value={summary.create} />
          <SummaryCard label="更新" value={summary.update} />
          <SummaryCard label="缺少图号待处理" value={summary.missingCode} tone="text-warn" />
          <SummaryCard label="错误" value={summary.error} tone="text-bad" />
          <SummaryCard label="总行数" value={summary.total} />
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full border-collapse text-sm" style={{ minWidth: "900px" }}>
            <thead>
              <tr>
                <th className="th">行号</th>
                <th className="th">处理结果</th>
                <th className="th">图号/编号</th>
                <th className="th">名称</th>
                <th className="th">分类</th>
                <th className="th">规格</th>
                <th className="th">单位</th>
                <th className="th" style={{ minWidth: "280px" }}>待处理方式</th>
                <th className="th">错误原因</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const resolution = resolutions[String(row.rowNumber)];
                return (
                  <tr key={row.rowNumber} className="row-hover">
                    <td className="td text-faint">{row.rowNumber}</td>
                    <td className="td"><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[row.status]}`}>{row.actionLabel}</span></td>
                    <td className="td mono text-xs">{row.code || "—"}</td>
                    <td className="td font-medium">{row.name || "—"}</td>
                    <td className="td text-dim">{row.categoryName || "—"}</td>
                    <td className="td text-dim">{row.spec || "—"}</td>
                    <td className="td text-dim">{row.unit || "—"}</td>
                    <td className="td">
                      {row.status === "MISSING_CODE" ? (
                        <div className="space-y-1.5">
                          <SearchSelect
                            value={resolution?.action === "UPDATE_EXISTING" ? resolution.materialId || "" : ""}
                            onChange={(materialId) =>
                              setResolutions((current) => ({
                                ...current,
                                [String(row.rowNumber)]: materialId ? { action: "UPDATE_EXISTING", materialId } : {},
                              }))
                            }
                            options={materialOptions}
                            placeholder="搜索并选择要更新的已有物料"
                          />
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              className="btn-ghost !px-2 !py-1 text-xs"
                              onClick={() =>
                                setResolutions((current) => ({
                                  ...current,
                                  [String(row.rowNumber)]: { action: "AUTO_CODE_CREATE", categoryId: row.categoryId },
                                }))
                              }
                            >
                              按分类自动编号并新增
                            </button>
                            <button
                              type="button"
                              className="btn-ghost !px-2 !py-1 text-xs"
                              onClick={() => setResolutions((current) => ({ ...current, [String(row.rowNumber)]: { action: "SKIP" } }))}
                            >
                              跳过该行
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="td text-bad">{row.error || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {flatCategories.length === 0 && <p className="text-xs text-warn">请先维护物料分类后再导入需要自动编号的物料。</p>}

      {result && (
        <div className="rounded-xl border border-ok/30 bg-ok/10 px-3 py-2.5 text-sm">
          <p className="font-medium text-ok">导入完成：新增 {result.created}，更新 {result.updated}，跳过 {result.skipped}，错误 {result.errors}{Number(result.revived || 0) > 0 ? `（其中 ${result.revived} 行为恢复已删除物料）` : ""}</p>
          {result.generatedCodes?.length > 0 && (
            <p className="mt-1 text-xs text-dim">
              自动生成图号：{result.generatedCodes.map((item) => `第${item.rowNumber}行 ${item.code}`).join("；")}
            </p>
          )}
          {result.errorMessages?.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-bad">
              {result.errorMessages.map((msg) => <li key={msg}>{msg}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {unresolvedRows.length > 0 && <span className="mr-auto text-xs text-warn">还有 {unresolvedRows.length} 行缺少图号/编号需要选择处理方式</span>}
        <button className="btn-ghost" onClick={onClose}>关闭</button>
        <button className="btn-brand" disabled={rows.length === 0 || unresolvedRows.length > 0 || confirming} onClick={() => void confirmImport()}>
          {confirming ? <Spinner className="!h-4 !w-4" /> : "确认导入"}
        </button>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-line px-2 py-2.5">
      <p className="text-xs text-faint">{label}</p>
      <p className={`mt-0.5 font-semibold ${tone || "text-ink"}`}>{value}</p>
    </div>
  );
}
