import { useEffect } from "react";

export interface ErpPrintContent {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
}

/**
 * 打印层：content 非空时渲染隐藏表格并触发系统打印，
 * 打印结束后回调清空（配合 styles.css 的 @media print 规则，只显示本层）。
 */
export function ErpPrintArea({ content, onDone }: { content: ErpPrintContent | null; onDone: () => void }) {
  useEffect(() => {
    if (!content) return;
    const restore = () => onDone();
    window.addEventListener("afterprint", restore, { once: true });
    const frame = window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => window.print()),
    );
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", restore);
    };
  }, [content, onDone]);

  if (!content) return null;
  return (
    <div className="erp-print-sheet" aria-hidden="true">
      <h1>{content.title}</h1>
      {content.subtitle && <p className="print-sub">{content.subtitle}</p>}
      <table>
        <thead>
          <tr>{content.headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {content.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => <td key={cellIndex}>{String(cell)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
