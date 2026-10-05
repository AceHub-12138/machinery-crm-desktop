/**
 * 小川图纸识别（对齐平台 2026-09 一期 src/lib/xiaochuan/pdf-page-render.ts）：
 * 在渲染进程里把 PDF 每一页渲染成图片，派生图随原 PDF 一起上传走既有视觉通道，
 * 服务端只做 unpdf 文字提取兜底——因此桌面端必须自己完成「页面 → 图片」。
 *
 * 边界（与平台一致）：
 * - 只渲染前 maxPages 页（配合每条消息 5 个附件的上限），超出由调用方提示；
 * - 长边压到 maxEdgePx 内、JPEG 0.9 质量，单页通常几百 KB，远低于 8MB 视觉上限；
 * - 任何失败向上抛错，由调用方降级为"仅按文字方式识别"（原 PDF 仍有服务端
 *   文字提取兜底），绝不阻断消息发送。
 *
 * worker 说明：Electron 生产环境以 file:// 加载渲染层，从 file:// 页面直接
 * new Worker(file-URL) 会被拦；这里用 Vite 的 ?worker&inline 把 pdf.worker 打成
 * blob 内联 worker（CSP 已放行 worker-src blob:），每次渲染独占一个实例，
 * 用完随 loadingTask 一起销毁，不留常驻线程。
 */

export type PdfPageImage = {
  pageNumber: number;
  blob: Blob;
  width: number;
  height: number;
};

/** 单份 PDF 默认最多转出的页面图片数（附件总上限 5 = PDF 本体 1 + 派生页 4） */
export const PDF_PAGE_RENDER_LIMIT = 4;
const MAX_EDGE_PX = 2000;

type PdfjsModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfjsModule> | null = null;
let workerCtorPromise: Promise<{ new (): Worker }> | null = null;

function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ||= import("pdfjs-dist");
  return pdfjsPromise;
}

function loadWorkerCtor(): Promise<{ new (): Worker }> {
  workerCtorPromise ||= import("pdfjs-dist/build/pdf.worker.min.mjs?worker&inline").then(
    (m) => m.default as { new (): Worker },
  );
  return workerCtorPromise;
}

export async function renderPdfPagesToImages(
  file: File,
  options: { maxPages?: number; maxEdgePx?: number } = {},
): Promise<{ pages: PdfPageImage[]; totalPages: number }> {
  const maxPages = options.maxPages ?? PDF_PAGE_RENDER_LIMIT;
  const maxEdgePx = options.maxEdgePx ?? MAX_EDGE_PX;

  const [pdfjs, WorkerCtor] = await Promise.all([loadPdfjs(), loadWorkerCtor()]);
  // PDFWorker.destroy() 不会终止外部传入的 port，底层线程要自己 terminate；
  // 用静态 create 而非 new：v6 的构造函数 d.ts 把 port 误标成了 null
  const port = new WorkerCtor();
  const worker = pdfjs.PDFWorker.create({ port });

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjs.getDocument({ data, worker });
    const doc = await loadingTask.promise;
    const pages: PdfPageImage[] = [];
    try {
      const totalPages = doc.numPages;
      const pageCount = Math.min(totalPages, maxPages);
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const page = await doc.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(
          maxEdgePx / Math.max(base.width, 1),
          maxEdgePx / Math.max(base.height, 1),
          4,
        );
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const context = canvas.getContext("2d");
        if (!context) throw new Error(`第 ${pageNumber} 页画布创建失败`);
        // JPEG 无透明通道，先铺白底，避免透明区域被压成黑色
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
        const width = canvas.width;
        const height = canvas.height;
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) throw new Error(`第 ${pageNumber} 页导出失败`);
        pages.push({ pageNumber, blob, width, height });
      }
      return { pages, totalPages };
    } finally {
      await loadingTask.destroy().catch(() => undefined);
    }
  } finally {
    worker.destroy();
    port.terminate();
  }
}
