export const PRODUCT_LANGUAGES = ["ZH", "EN", "ES", "RU"] as const;
export const PRODUCT_LANGUAGE_LABELS: Record<string, string> = { ZH: "中文", EN: "English", ES: "Español", RU: "Русский" };

export interface ProductTranslationForm {
  language: string;
  name: string;
  description: string;
  specs: string;
  pdfUrl: string;
}

export interface ProductFormData {
  model: string;
  category: string;
  productType: string;
  imageUrl: string;
  videoUrl: string;
  factoryPrice: string;
  currency: string;
  remark: string;
  isActive: boolean;
  translations: ProductTranslationForm[];
}

function nullableText(value: string) {
  return value.trim() || null;
}

export function buildProductPayload(form: ProductFormData) {
  const model = form.model.trim();
  const category = form.category.trim();
  if (!model || !category) throw new Error("产品型号和分类为必填项");
  const rawPrice = form.factoryPrice.trim();
  const factoryPrice = rawPrice ? Number(rawPrice) : null;
  if (factoryPrice !== null && (!Number.isFinite(factoryPrice) || factoryPrice < 0)) throw new Error("出厂价必须为大于等于 0 的数字");
  const isMain = form.productType === "MAIN";
  const translations = form.translations
    .filter((translation) => translation.name.trim())
    .map((translation) => {
      let specs: unknown = null;
      if (translation.specs.trim()) {
        try {
          specs = JSON.parse(translation.specs);
        } catch {
          throw new Error(`${PRODUCT_LANGUAGE_LABELS[translation.language] || translation.language}规格必须是合法 JSON`);
        }
      }
      return {
        language: translation.language,
        name: translation.name.trim(),
        description: nullableText(translation.description),
        specs,
        pdfUrl: isMain ? nullableText(translation.pdfUrl) : null,
      };
    });
  return {
    model,
    category,
    productType: isMain ? "MAIN" : "OPTIONAL",
    imageUrl: isMain ? nullableText(form.imageUrl) : null,
    videoUrl: isMain ? nullableText(form.videoUrl) : null,
    factoryPrice,
    currency: form.currency || "CNY",
    remark: nullableText(form.remark),
    isActive: form.isActive,
    translations,
  };
}
