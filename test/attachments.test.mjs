import { test } from "node:test";
import assert from "node:assert/strict";

import {
  attachmentExt,
  attachmentKind,
  attachmentKindLabel,
  attachmentName,
  formatBytes,
  isPreviewable,
  resolveAttachmentRequest,
} from "../src/lib/attachments.ts";

test("附件类型判定以扩展名优先（平台对 xls/xlsx 返回 octet-stream）", () => {
  assert.equal(attachmentKind("/uploads/a.JPG"), "image");
  assert.equal(attachmentKind("/uploads/合同扫描件.pdf"), "pdf");
  assert.equal(attachmentKind("/uploads/demo.mp4?t=1"), "video");
  assert.equal(attachmentKind("/uploads/voice.m4a"), "audio");
  assert.equal(attachmentKind("/uploads/export.csv"), "text");
  assert.equal(attachmentKind("/uploads/报价单.xlsx", "application/octet-stream"), "office");
  assert.equal(attachmentKind("/uploads/word.docx"), "office");
});

test("附件类型判定回退到 mime，未知格式归 other", () => {
  assert.equal(attachmentKind("/api/uploads/noext", "image/png"), "image");
  assert.equal(attachmentKind("/api/uploads/noext", "application/pdf"), "pdf");
  assert.equal(attachmentKind("/api/uploads/noext", "text/plain; charset=utf-8"), "text");
  assert.equal(attachmentKind("/api/uploads/noext", "application/octet-stream"), "other");
  assert.equal(attachmentKind("/api/uploads/图纸.dwg"), "other");
});

test("可在应用内渲染的类型：图片/PDF/视频/音频/文本", () => {
  assert.equal(isPreviewable("image"), true);
  assert.equal(isPreviewable("pdf"), true);
  assert.equal(isPreviewable("video"), true);
  assert.equal(isPreviewable("audio"), true);
  assert.equal(isPreviewable("text"), true);
  assert.equal(isPreviewable("office"), false);
  assert.equal(isPreviewable("other"), false);
  assert.equal(attachmentKindLabel("pdf"), "PDF 文档");
});

test("附件名取路径末段并解码，缺省回退占位名", () => {
  assert.equal(attachmentName("/uploads/contracts/2026/%E5%90%88%E5%90%8C.pdf"), "合同.pdf");
  assert.equal(attachmentName("/uploads/a.png?v=2"), "a.png");
  assert.equal(attachmentName("", "附件"), "附件");
  assert.equal(attachmentExt("noext"), "");
});

test("资源地址折算：/uploads 走平台鉴权路径，绝对地址只取 origin + path", () => {
  assert.deepEqual(resolveAttachmentRequest("/uploads/shipments/a.png", "https://dachuan.pro"), {
    baseUrl: "https://dachuan.pro",
    path: "/api/uploads/shipments/a.png",
  });
  assert.deepEqual(resolveAttachmentRequest("/api/uploads/a.png", "https://dachuan.pro"), {
    baseUrl: "https://dachuan.pro",
    path: "/api/uploads/a.png",
  });
  assert.deepEqual(resolveAttachmentRequest("https://cdn.example.com/x/y.mp4?sig=1", "https://dachuan.pro"), {
    baseUrl: "https://cdn.example.com",
    path: "/x/y.mp4?sig=1",
  });
  assert.equal(resolveAttachmentRequest("", "https://dachuan.pro"), null);
  assert.equal(resolveAttachmentRequest("uploads/a.png", "https://dachuan.pro"), null);
  assert.equal(resolveAttachmentRequest("/uploads/a.png", ""), null);
});

test("附件体积格式化", () => {
  assert.equal(formatBytes(0), "—");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(3 * 1024 * 1024), "3.00 MB");
});
