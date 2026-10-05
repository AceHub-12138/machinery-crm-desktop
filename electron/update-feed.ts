/**
 * 更新源地址规范化（纯逻辑，便于单测）。
 *
 * 登录页填的是「服务器地址」，更新 feed 固定是 `<服务器>/api/downloads/desktop`。
 * 但如果有人把下载目录一起粘进服务器地址（…/api/downloads/desktop），再拼一次后缀就成了
 * `…/desktop/api/downloads/desktop/latest.yml` → 404（客户端日志里真实出现过），
 * 所以拼之前先剥掉重复后缀。
 */

/** feed 相对服务器根目录的固定后缀（平台公开下载目录） */
export const FEED_SUFFIX = "/api/downloads/desktop";

/** 去掉尾部斜杠与重复的 feed 后缀，得到纯服务器根地址；空输入返回空串 */
export function normalizeServerBase(baseUrl?: string | null): string {
  const raw = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  const stripped = raw.toLowerCase().endsWith(FEED_SUFFIX) ? raw.slice(0, -FEED_SUFFIX.length) : raw;
  return stripped.replace(/\/+$/, "");
}

/** 由服务器地址拼出更新 feed；baseUrl 为空时用默认服务器 */
export function updateFeedUrl(baseUrl: string | null | undefined, defaultServer: string): string {
  const base = normalizeServerBase(baseUrl) || normalizeServerBase(defaultServer);
  return `${base}${FEED_SUFFIX}`;
}
