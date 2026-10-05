import { test } from "node:test";
import assert from "node:assert/strict";

import { buildProductPayload } from "../src/lib/products.ts";

test("产品保存把多语言数组和媒体字段按平台契约发送", () => {
  const payload = buildProductPayload({
    model: " BK5030 ", category: "数控插床", productType: "MAIN", factoryPrice: "123.45", currency: "CNY",
    remark: " 主力机型 ", imageUrl: "/uploads/products/images/a.png", videoUrl: "/uploads/products/videos/a.mp4", isActive: true,
    translations: [
      { language: "ZH", name: " 数控插床 ", description: " 中文说明 ", specs: '{"行程":"300mm"}', pdfUrl: "/uploads/products/docs/a.pdf" },
      { language: "EN", name: "", description: "ignored", specs: "", pdfUrl: "" },
    ],
  });
  assert.deepEqual(payload, {
    model: "BK5030", category: "数控插床", productType: "MAIN", factoryPrice: 123.45, currency: "CNY",
    remark: "主力机型", imageUrl: "/uploads/products/images/a.png", videoUrl: "/uploads/products/videos/a.mp4", isActive: true,
    translations: [{ language: "ZH", name: "数控插床", description: "中文说明", specs: { 行程: "300mm" }, pdfUrl: "/uploads/products/docs/a.pdf" }],
  });
});

test("选配产品按原平台规则清空图片、视频和语言资料", () => {
  const payload = buildProductPayload({
    model: "刀架", category: "其他设备", productType: "OPTIONAL", factoryPrice: "", currency: "CNY", remark: "",
    imageUrl: "/images/old.png", videoUrl: "/videos/old.mp4", isActive: false,
    translations: [{ language: "ZH", name: "刀架", description: "", specs: "", pdfUrl: "/docs/old.pdf" }],
  });
  assert.equal(payload.imageUrl, null);
  assert.equal(payload.videoUrl, null);
  assert.equal(payload.translations[0].pdfUrl, null);
  assert.equal(payload.factoryPrice, null);
  assert.equal(payload.isActive, false);
});
