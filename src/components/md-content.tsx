import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * 小川回答的 Markdown 渲染层（对齐平台 2026-09 小川一期 markdown-content.tsx）：
 * 模型按习惯输出 Markdown（标题/列表/表格/代码块），此前聊天气泡按纯文本直出，
 * 用户看到的是原始星号井号；现在统一在这里渲染成排版。
 * 只用于小川（assistant）正常回复；用户消息与错误提示仍是纯文本，由调用方原样直出。
 * 色板使用桌面端主题 Token，自动跟随浅/深色换肤。
 */

const markdownComponents: Components = {
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => (
    <h1 className="mb-1.5 mt-3 text-base font-semibold text-ink first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1.5 mt-3 text-[15px] font-semibold text-ink first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2.5 text-sm font-semibold text-ink first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1 mt-2.5 text-sm font-semibold text-ink first:mt-0">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="mb-1 mt-2 text-[13px] font-semibold text-dim first:mt-0">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="mb-1 mt-2 text-[13px] font-semibold text-faint first:mt-0">{children}</h6>
  ),
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 pl-5 first:mt-0 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 pl-5 first:mt-0 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-1.5 border-l-2 border-brand/50 pl-2.5 text-dim">{children}</blockquote>
  ),
  hr: () => <hr className="my-2.5 border-line" />,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        // 桌面端窗口内不允许导航，外链交给系统浏览器
        const url = href || "";
        if (/^https?:\/\//i.test(url)) {
          e.preventDefault();
          window.dachuan.openExternal(url);
        }
      }}
      className="text-brandhi underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  // 行内代码；代码块内的 code 由 pre 的 [&_code] 重置接管
  code: ({ children, className }) => (
    <code
      className={`rounded bg-panel2 px-1 py-0.5 font-mono text-[12px] text-brandhi ${className || ""}`}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-xl bg-zinc-950 p-3 text-xs leading-5 text-zinc-100 first:mt-0 last:mb-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto first:mt-0 last:mb-0">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-panel2">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-line px-2 py-1 text-left font-medium text-dim">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-line px-2 py-1 align-top">{children}</td>
  ),
};

export function MdContent({ content, className = "" }: { content: string; className?: string }) {
  return (
    <div className={`text-sm leading-relaxed ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
