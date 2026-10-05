import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit2, Eye, FileText, Film, Image as ImageIcon, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { api, getCachedUser, uploadFile } from "../lib/api";
import { PRODUCT_TYPE, date, label, money } from "../lib/format";
import { Dash, Empty, ErrorTip, PageHeader, Pill, Spinner, showToast } from "../components/ui";
import { AttachmentImage, AttachmentLink } from "../components/attachment-preview";
import {
  PRODUCT_LANGUAGES,
  PRODUCT_LANGUAGE_LABELS,
  buildProductPayload,
  type ProductFormData,
  type ProductTranslationForm,
} from "../lib/products";
import type { ProductRow } from "../types";

const PRODUCT_CATEGORIES = ["数控插床", "数控插齿机", "插床", "刨床", "加工中心", "其他设备"];
const blankTranslation = (language = "ZH"): ProductTranslationForm => ({ language, name: "", description: "", specs: "", pdfUrl: "" });
const blankForm = (): ProductFormData => ({
  model: "", category: PRODUCT_CATEGORIES[0], productType: "MAIN", imageUrl: "", videoUrl: "", factoryPrice: "", currency: "CNY", remark: "", isActive: true,
  translations: [blankTranslation()],
});

type ProductUploadResult = { url: string; fileName: string; fileType: "image" | "video" | "doc" };

function toForm(product: ProductRow): ProductFormData {
  return {
    model: product.model,
    category: product.category,
    productType: product.productType,
    imageUrl: product.imageUrl || "",
    videoUrl: product.videoUrl || "",
    factoryPrice: product.factoryPrice === null || product.factoryPrice === undefined ? "" : String(Number(product.factoryPrice)),
    currency: product.currency || "CNY",
    remark: product.remark || "",
    isActive: product.isActive,
    translations: product.translations?.length ? product.translations.map((translation) => ({
      language: translation.language,
      name: translation.name || "",
      description: translation.description || "",
      specs: translation.specs ? JSON.stringify(translation.specs, null, 2) : "",
      pdfUrl: translation.pdfUrl || "",
    })) : [blankTranslation()],
  };
}

function ProductImage({ path, alt }: { path: string; alt: string }) {
  return <AttachmentImage path={path} alt={alt} className="h-20 w-20 rounded-xl border border-line object-cover" />;
}

export default function ProductsView() {
  const canManage = getCachedUser()?.role === "SUPER_ADMIN";
  const [search, setSearch] = useState("");
  // 服务端筛选：与平台 /api/products 的 category / productType 查询参数对齐
  const [category, setCategory] = useState("");
  const [productType, setProductType] = useState("");
  const [rows, setRows] = useState<ProductRow[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"view" | "edit" | "create" | null>(null);
  const [selected, setSelected] = useState<ProductRow | null>(null);
  const [form, setForm] = useState<ProductFormData>(blankForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [newLanguage, setNewLanguage] = useState("EN");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // 空值由 api() 清理后不下发，等价于平台 if (category) params.set(...) 的行为
      const result = await api<ProductRow[]>("/api/products", { query: { category, productType } });
      setRows(Array.isArray(result) ? result : []);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [category, productType]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows || [];
    return (rows || []).filter((product) => [product.model, product.category, ...product.translations?.map((item) => item.name) || []].some((value) => value?.toLowerCase().includes(keyword)));
  }, [rows, search]);
  const availableLanguages = useMemo(
    () => PRODUCT_LANGUAGES.filter((language) => !form.translations.some((item) => item.language === language)),
    [form.translations],
  );
  useEffect(() => {
    if (!availableLanguages.includes(newLanguage as (typeof PRODUCT_LANGUAGES)[number])) setNewLanguage(availableLanguages[0] || "");
  }, [availableLanguages, newLanguage]);

  const open = (kind: "view" | "edit" | "create", product?: ProductRow) => {
    setSelected(product || null);
    setForm(product ? toForm(product) : blankForm());
    setUploading("");
    setModal(kind);
  };

  const updateTranslation = (index: number, field: keyof ProductTranslationForm, value: string) => {
    setForm((current) => ({ ...current, translations: current.translations.map((translation, itemIndex) => itemIndex === index ? { ...translation, [field]: value } : translation) }));
  };

  const upload = async (file: File, field: "imageUrl" | "videoUrl" | "pdfUrl", index?: number) => {
    const key = index === undefined ? field : `${field}-${index}`;
    setUploading(key);
    try {
      const result = await uploadFile<ProductUploadResult>("/api/upload/products", file);
      if (field === "pdfUrl" && result.fileType !== "doc") throw new Error("语言资料仅支持 PDF、Word 文件");
      if (field === "imageUrl" && result.fileType !== "image") throw new Error("产品图片文件类型不正确");
      if (field === "videoUrl" && result.fileType !== "video") throw new Error("产品视频文件类型不正确");
      if (field === "pdfUrl" && index !== undefined) updateTranslation(index, "pdfUrl", result.url);
      else setForm((current) => ({ ...current, [field]: result.url }));
      showToast(`已上传 ${result.fileName}`, "success");
    } catch (reason) {
      showToast((reason as Error).message, "error");
    } finally {
      setUploading("");
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const body = buildProductPayload(form);
      if (selected) await api(`/api/products/${selected.id}`, { method: "PUT", body });
      else await api("/api/products", { method: "POST", body });
      showToast(selected ? "产品已更新" : "产品已创建", "success");
      setModal(null);
      await load();
    } catch (reason) {
      showToast((reason as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (product: ProductRow) => {
    if (!window.confirm(`确认删除产品“${product.model}”？`)) return;
    try {
      await api(`/api/products/${product.id}`, { method: "DELETE" });
      showToast("产品已删除", "success");
      await load();
    } catch (reason) {
      showToast((reason as Error).message, "error");
    }
  };

  return <div className="flex-1 flex flex-col overflow-hidden">
    <div className="px-6 pt-5 pb-4"><PageHeader title="产品库" sub={`共 ${filtered.length} 个启用产品 · 与平台产品库一致`}><select className="input !w-auto" value={productType} onChange={(event) => setProductType(event.target.value)}><option value="">全部类型</option><option value="MAIN">主产品</option><option value="OPTIONAL">选配产品</option></select><select className="input !w-auto" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">全部分类</option>{PRODUCT_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select><div className="relative w-60"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input !pl-8" placeholder="搜索型号 / 分类 / 名称" value={search} onChange={(event) => setSearch(event.target.value)} /></div>{canManage && <button className="btn-brand" onClick={() => open("create")}><Plus size={15} />新建</button>}<button className="btn-ghost !px-2.5" title="刷新" onClick={() => void load()}>{loading ? <Spinner className="!h-4 !w-4" /> : <RefreshCw size={15} />}</button></PageHeader></div>
    <div className="flex-1 overflow-y-auto px-6 pb-4"><div className="panel overflow-hidden"><table className="w-full border-collapse"><thead className="sticky top-0 z-10 bg-panel"><tr>{["产品型号", "名称", "分类", "类型", "出厂价", "创建时间", "操作"].map((item) => <th className="th" key={item}>{item}</th>)}</tr></thead><tbody>{filtered.map((product, index) => <tr key={product.id} className="row-hover fade-up" style={{ animationDelay: `${Math.min(index * 25, 400)}ms` }}><td className="td mono font-medium">{product.model}</td><td className="td">{product.translations?.find((item) => item.language === "ZH")?.name || product.translations?.[0]?.name || <Dash />}</td><td className="td text-dim">{product.category}</td><td className="td"><Pill tone={product.productType === "MAIN" ? "text-brandhi bg-brand/10" : "text-dim bg-steel/25"}>{label(PRODUCT_TYPE, product.productType)}</Pill></td><td className="td mono">{product.factoryPrice != null ? money(product.factoryPrice, product.currency) : <Dash />}</td><td className="td mono text-xs text-dim">{date(product.createdAt)}</td><td className="td"><div className="flex gap-1"><button className="btn-ghost !px-2" title="详情" onClick={() => open("view", product)}><Eye size={14} /></button>{canManage && <><button className="btn-ghost !px-2" title="编辑" onClick={() => open("edit", product)}><Edit2 size={14} /></button><button className="btn-ghost !px-2 text-bad" title="删除" onClick={() => void remove(product)}><Trash2 size={14} /></button></>}</div></td></tr>)}</tbody></table>{loading && !rows && <div className="flex justify-center py-16"><Spinner /></div>}{!loading && error && <ErrorTip message={error} onRetry={() => void load()} />}{!loading && !error && rows && filtered.length === 0 && <Empty text="没有匹配的产品" />}</div></div>

    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"><div className="panel max-h-[92vh] w-full max-w-3xl overflow-y-auto p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{modal === "view" ? "产品详情" : modal === "create" ? "新建产品" : "编辑产品"}</h2><button className="btn-ghost !px-2" onClick={() => setModal(null)}><X size={18} /></button></div>
      {modal === "view" && selected ? <ProductDetail product={selected} /> : <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3"><label className="text-xs text-dim">产品类型<select className="input mt-1" value={form.productType} onChange={(event) => setForm({ ...form, productType: event.target.value })}><option value="MAIN">主产品</option><option value="OPTIONAL">选配产品</option></select></label><label className="text-xs text-dim">产品型号 *<input className="input mt-1" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} /></label><label className="text-xs text-dim">分类 *<select className="input mt-1" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{PRODUCT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label><label className="text-xs text-dim">出厂价<input className="input mt-1 mono" type="number" min="0" step="0.01" value={form.factoryPrice} onChange={(event) => setForm({ ...form, factoryPrice: event.target.value })} /></label><label className="text-xs text-dim">币种<select className="input mt-1" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}><option value="CNY">CNY 人民币</option><option value="USD">USD 美元</option></select></label><label className="col-span-2 text-xs text-dim">备注<textarea className="input mt-1" rows={2} value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></label></div>
        {form.productType === "MAIN" && <div className="grid grid-cols-2 gap-3"><UploadField icon={<ImageIcon size={15} />} label="产品图片" accept=".jpg,.jpeg,.png,.webp" value={form.imageUrl} busy={uploading === "imageUrl"} onFile={(file) => void upload(file, "imageUrl")} /><UploadField icon={<Film size={15} />} label="产品视频" accept=".mp4,.mov,.avi,.webm" value={form.videoUrl} busy={uploading === "videoUrl"} onFile={(file) => void upload(file, "videoUrl")} /></div>}
        <div><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">多语言资料</h3><div className="flex gap-2"><select className="input !w-auto" value={newLanguage} onChange={(event) => setNewLanguage(event.target.value)}>{availableLanguages.map((language) => <option key={language} value={language}>{PRODUCT_LANGUAGE_LABELS[language]}</option>)}</select><button className="btn-ghost" disabled={!newLanguage} onClick={() => { if (newLanguage && !form.translations.some((item) => item.language === newLanguage)) setForm({ ...form, translations: [...form.translations, blankTranslation(newLanguage)] }); }}>添加语言</button></div></div><div className="space-y-3">{form.translations.map((translation, index) => <div className="panel p-3" key={translation.language}><div className="mb-2 flex justify-between"><b className="text-sm">{PRODUCT_LANGUAGE_LABELS[translation.language] || translation.language}</b>{form.translations.length > 1 && <button className="text-xs text-bad" onClick={() => setForm({ ...form, translations: form.translations.filter((_, itemIndex) => itemIndex !== index) })}>移除</button>}</div><div className="grid grid-cols-2 gap-3"><label className="text-xs text-dim">产品名称<input className="input mt-1" value={translation.name} onChange={(event) => updateTranslation(index, "name", event.target.value)} /></label><label className="text-xs text-dim">产品描述<textarea className="input mt-1" rows={2} value={translation.description} onChange={(event) => updateTranslation(index, "description", event.target.value)} /></label><label className="col-span-2 text-xs text-dim">规格 JSON<textarea className="input mt-1 mono" rows={3} value={translation.specs} onChange={(event) => updateTranslation(index, "specs", event.target.value)} placeholder={'{"行程":"300mm"}'} /></label>{form.productType === "MAIN" && <div className="col-span-2"><UploadField icon={<FileText size={15} />} label="产品资料" accept=".pdf,.doc,.docx" value={translation.pdfUrl} busy={uploading === `pdfUrl-${index}`} onFile={(file) => void upload(file, "pdfUrl", index)} /></div>}</div></div>)}</div></div>
        <div className="flex justify-end gap-2 border-t border-line/60 pt-4"><button className="btn-ghost" onClick={() => setModal(null)}>取消</button><button className="btn-brand" disabled={saving || Boolean(uploading)} onClick={() => void save()}>{saving ? <Spinner className="!h-4 !w-4" /> : "保存"}</button></div>
      </div>}
    </div></div>}
  </div>;
}

function UploadField({ icon, label, accept, value, busy, onFile }: { icon: React.ReactNode; label: string; accept: string; value: string; busy: boolean; onFile: (file: File) => void }) {
  return <label className="panel flex cursor-pointer flex-col gap-2 p-3 text-xs text-dim"><span className="flex items-center gap-2 font-medium text-ink">{icon}{label}</span><input className="hidden" type="file" accept={accept} disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ""; }} /><span>{busy ? "上传中…" : value ? `已上传：${value}` : "点击选择文件"}</span></label>;
}

function ProductDetail({ product }: { product: ProductRow }) {
  return <div className="space-y-4 text-sm"><div className="flex items-start gap-4">{product.imageUrl && <ProductImage path={product.imageUrl} alt={product.model} />}<dl className="grid flex-1 grid-cols-2 gap-3"><div><dt className="text-xs text-faint">型号</dt><dd className="mono mt-1">{product.model}</dd></div><div><dt className="text-xs text-faint">分类</dt><dd className="mt-1">{product.category}</dd></div><div><dt className="text-xs text-faint">类型</dt><dd className="mt-1">{label(PRODUCT_TYPE, product.productType)}</dd></div><div><dt className="text-xs text-faint">出厂价</dt><dd className="mt-1">{product.factoryPrice == null ? "—" : money(product.factoryPrice, product.currency)}</dd></div></dl></div>{product.videoUrl && <AttachmentLink path={product.videoUrl} label={`${product.model} 产品视频`} className="btn-ghost text-xs"><Film size={14} />查看产品视频</AttachmentLink>}<div className="space-y-3">{product.translations?.map((translation) => <section className="panel p-3" key={translation.language}><h3 className="font-medium">{PRODUCT_LANGUAGE_LABELS[translation.language] || translation.language} · {translation.name}</h3>{translation.description && <p className="mt-2 whitespace-pre-wrap text-dim">{translation.description}</p>}{translation.specs != null && <pre className="mt-2 overflow-auto rounded-lg bg-panel2 p-2 text-xs">{JSON.stringify(translation.specs, null, 2)}</pre>}{translation.pdfUrl && <AttachmentLink path={translation.pdfUrl} label={`${translation.name || product.model} 产品资料`} className="mt-2 inline-flex items-center gap-1 text-xs text-brandhi"><FileText size={13} />查看产品资料</AttachmentLink>}</section>)}</div>{product.remark && <p className="text-dim">备注：{product.remark}</p>}</div>;
}
