/**
 * SSE 文本流增量解析器（纯逻辑，无 Electron 依赖，可被 node:test 直接导入验证）。
 * 每个分片必须以 stream:true 喂给 TextDecoder——否则跨分片的多字节 UTF-8 字符（中文）
 * 会被替换为 U+FFFD 乱码；流结束时用 decode() flush 滞留的尾字节。
 */
export class SSEParser {
  private buffer = "";
  private decoder = new TextDecoder("utf-8");

  feed(chunk: Uint8Array): string[] {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    const events: string[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf("\n\n")) >= 0) {
      const block = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        events.push(line.slice(6));
      }
    }
    return events;
  }

  /** 流结束时调用：flush 残余尾字节并解析未成帧的数据（通常为空，出现即代表服务器截流） */
  flush(): string[] {
    this.buffer += this.decoder.decode();
    const rest = this.buffer;
    this.buffer = "";
    const events: string[] = [];
    if (!rest) return events;
    for (const line of rest.split("\n")) {
      if (line.startsWith("data: ")) events.push(line.slice(6));
    }
    return events;
  }
}
