// 单元测试：更新 feed 地址规范化（服务器地址被填成下载目录时不能重复拼后缀）。
import { test } from "node:test";
import assert from "node:assert/strict";

import { FEED_SUFFIX, normalizeServerBase, updateFeedUrl } from "../electron/update-feed.ts";

const DEFAULT_SERVER = "https://dachuan.pro";

test("常规服务器地址拼出 feed", () => {
  assert.equal(updateFeedUrl("https://dachuan.pro", DEFAULT_SERVER), `https://dachuan.pro${FEED_SUFFIX}`);
});

test("尾部斜杠不影响结果", () => {
  assert.equal(updateFeedUrl("https://dachuan.pro///", DEFAULT_SERVER), `https://dachuan.pro${FEED_SUFFIX}`);
  assert.equal(normalizeServerBase("https://dachuan.pro/"), "https://dachuan.pro");
});

test("服务器地址里已经带了下载目录时不再重复拼（曾导致 latest.yml 404）", () => {
  assert.equal(
    updateFeedUrl("https://dachuan.pro/api/downloads/desktop", DEFAULT_SERVER),
    `https://dachuan.pro${FEED_SUFFIX}`,
  );
  assert.equal(
    updateFeedUrl("https://dachuan.pro/api/downloads/desktop/", DEFAULT_SERVER),
    `https://dachuan.pro${FEED_SUFFIX}`,
  );
  // 关键回归：不能拼出 …/desktop/api/downloads/desktop/latest.yml
  assert.ok(!updateFeedUrl("https://dachuan.pro/api/downloads/desktop", DEFAULT_SERVER).includes(`${FEED_SUFFIX}${FEED_SUFFIX}`));
});

test("内网/测试服务器同样按服务器根拼", () => {
  assert.equal(updateFeedUrl("http://192.168.1.10:3000", DEFAULT_SERVER), `http://192.168.1.10:3000${FEED_SUFFIX}`);
});

test("服务器地址为空时回落到默认服务器", () => {
  assert.equal(updateFeedUrl("", DEFAULT_SERVER), `https://dachuan.pro${FEED_SUFFIX}`);
  assert.equal(updateFeedUrl(undefined, DEFAULT_SERVER), `https://dachuan.pro${FEED_SUFFIX}`);
  assert.equal(updateFeedUrl("   ", DEFAULT_SERVER), `https://dachuan.pro${FEED_SUFFIX}`);
});
