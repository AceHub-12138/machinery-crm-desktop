import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import ts from "typescript";
import { updateFeedUrl } from "../electron/update-feed.ts";

function updaterHarness() {
  const handlers = new Map();
  const feeds = [];
  let fail = false;
  const autoUpdater = {
    setFeedURL: (feed) => { feeds.push(feed); if (fail) throw new Error("network unavailable"); },
    checkForUpdates: async () => undefined,
  };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL("../electron/updater.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dependencies = {
    electron: {
      app: { isPackaged: true, getVersion: () => "1.1.0", getPath: () => "/tmp" },
      BrowserWindow: { getAllWindows: () => [] }, ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    },
    "electron-updater": { autoUpdater }, "node:fs": { appendFileSync: () => undefined },
    "node:path": path, "./update-feed": { updateFeedUrl },
  };
  vm.runInNewContext(code, {
    module, exports: module.exports, require: (name) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
      return dependencies[name];
    },
    process: { env: { DC_UPDATE_URL: "https://attacker.invalid" }, argv: ["app", "--dc-update-url=https://attacker.invalid"] },
  });
  module.exports.registerUpdaterIpc();
  return { check: handlers.get("app:update-check"), feeds, setFailure: (value) => { fail = value; } };
}

test("恶意渲染端地址、环境变量和启动参数均不能改变实际更新源", async () => {
  const app = updaterHarness();
  assert.equal((await app.check({}, "https://attacker.invalid")).ok, true);
  assert.equal(app.feeds[0].url, "https://dachuan.pro/api/downloads/desktop");
  assert.equal(app.feeds[0].useMultipleRangeRequest, false);
});

test("设置更新源失败后可以再次检查，不永久停留在检查中", async () => {
  const app = updaterHarness();
  app.setFailure(true);
  assert.equal((await app.check({})).ok, false);
  app.setFailure(false);
  assert.equal((await app.check({})).ok, true);
  assert.equal(app.feeds.length, 2);
});
