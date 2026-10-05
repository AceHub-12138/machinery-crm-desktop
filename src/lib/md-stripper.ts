// 小川 AI 输出的 Markdown 剥离器：渲染前把 MD 语法转为对话式纯文本。
// 约束：绝不出 *、|----|、##、---- 空行、| 分割等任何 MD 痕迹；行文风格与正常聊天一致。
// 设计为幂等：已剥离文本再跑一遍结果不变（避免流式过程中二次处理出错）。

/** 行内：**粗体** / *斜体* / `code` / ~~删除~~ → 纯词（保留内部文字，去包裹符） */
function stripInline(line: string): string {
  let out = line;
  // `code`（先于别的处理，防止内部星号误伤场景最少）
  out = out.replace(/`([^`]+)`/g, "$1");
  // **粗体** 与 __粗体__
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1");
  // *斜体* 与 _斜体_（单词式下划线属常见拼写，不做处理：仅当成对出现于行内）
  out = out.replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, "$1");
  out = out.replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, "$1");
  // ~~删除线~~
  out = out.replace(/~~([^~]+)~~/g, "$1");
  // [链接](地址) → 链接（地址为 http 且与文字不同才附加括号地址）
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, href: string) =>
    href && typeof href === "string" && href.startsWith("http") && href !== text ? `${text}（${href}）` : text,
  );
  return out;
}

/**
 * 整段剥离：标题/表格/引用/序号 MD 语法/水平线/代码围栏/HTML 标签 → 纯文本。
 * 多空行折叠为一个空行（MD 的“空两行”视感消失）。幂等。
 */
export function stripMarkdown(raw: string): string {
  if (!raw) return "";
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // 代码围栏 ```lang ... ```：围栏行本身丢弃，内容保留为普通文本行
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push(line.trimEnd());
      continue;
    }

    // 水平线：--- / *** / ___（含 |----| 表格分隔线在表格步骤处理，这里处理纯水平线）
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      trimBlank(out);
      continue;
    }

    // 标题 # ... ######（含行尾 # 号序列）
    if (/^\s{0,3}#{1,6}\s+/.test(line)) {
      line = line.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/\s+#+\s*$/, "");
      pushNonBlank(out, stripInline(line));
      continue;
    }

    // 引用块 > xxx：去掉 > 前缀（连续 > 也一并吞掉）
    if (/^\s{0,3}>/.test(line)) {
      line = line.replace(/^\s{0,3}>\s?/, "");
      pushNonBlank(out, stripInline(line));
      continue;
    }

    // 表格：当前行含 | 且下一行是分隔行（|---|---| 或 --- | --- 的任意混排）→ 丢弃分隔行、保留数据行
    const next = lines[i + 1] || "";
    if (line.includes("|") && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(next)) {
      // 数据行：去掉首尾表格竖线、把单元格间竖线换为“、”式分隔（对话风格）
      const cells = splitTableRow(line);
      if (cells.length > 1) {
        pushNonBlank(out, stripInline(cells.map((c) => c.trim()).filter(Boolean).join("，")));
      } else {
        pushNonBlank(out, stripInline(cells[0] || ""));
      }
      i++; // 跳过分隔行
      continue;
    }
    // 表格分隔行单独出现（无上文数据行，如已被拆流的残片）：丢弃
    if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line)) {
      continue;
    }
    // 数据行（前一行刚出现过表头）——统一转成“， ”连接
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = splitTableRow(line);
      pushNonBlank(out, stripInline(cells.map((c) => c.trim()).filter(Boolean).join("，")));
      continue;
    }

    // MD 列表记号：- / * / + 开头 → 用 "· " 前缀；数字序号 "1." → "1. "（正常文本写法）
    if (/^\s*[-*+]\s+/.test(line)) {
      pushNonBlank(out, "· " + stripInline(line.replace(/^\s*[-*+]\s+/, "")));
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      pushNonBlank(out, stripInline(line.replace(/^\s*(\d+)\.\s+/, "$1. ")));
      continue;
    }

    pushNonBlank(out, stripInline(line.trimEnd()));
  }

  // 折叠连续空行为一行；含开头结尾的空行都去掉
  const collapsed: string[] = [];
  for (const line of out) {
    const blank = line.trim() === "";
    if (blank && (collapsed.length === 0 || collapsed[collapsed.length - 1] === "")) continue;
    collapsed.push(line);
  }
  while (collapsed.length && collapsed[collapsed.length - 1] === "") collapsed.pop();
  return collapsed.join("\n");

  function pushNonBlank(arr: string[], value: string) {
    // 与列表/表格转换后的空元素交互：空串只在真实空行场景压入
    arr.push(value === "" ? "" : value);
    trimBlank(arr);
  }
  function trimBlank(arr: string[]) {
    if (arr.length > 1 && arr[arr.length - 1] === "" && arr[arr.length - 2] === "") arr.pop();
  }
  function splitTableRow(line: string): string[] {
    let s = line.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|")) s = s.slice(0, -1);
    return s.split("|");
  }
}
