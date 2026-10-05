// 开发模式：先起 Vite 渲染进程热更新服务，再拉起 Electron 指向 dev server
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { build } from "esbuild";

function waitPort(port, retries = 60) {
  return new Promise((resolve, reject) => {
    const tryOnce = (left) => {
      const sock = createServer();
      fetch(`http://127.0.0.1:${port}/`)
        .then(() => resolve())
        .catch(() => {
          if (left <= 0) return reject(new Error("vite dev server 启动超时"));
          setTimeout(() => tryOnce(left - 1), 500);
        });
      sock.close();
    };
    tryOnce(retries);
  });
}

await build({ bundle: true, platform: "node", format: "cjs", external: ["electron"], target: "node20", entryPoints: ["electron/main.ts"], outfile: "dist-electron/main.cjs" });
await build({ bundle: true, platform: "node", format: "cjs", external: ["electron"], target: "node20", entryPoints: ["electron/preload.ts"], outfile: "dist-electron/preload.cjs" });

const vite = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", "5188"], { shell: true, stdio: "inherit" });
try {
  await waitPort(5188);
} catch (e) {
  vite.kill();
  console.error(e.message);
  process.exit(1);
}

const electron = spawn("npx", ["electron", "."], {
  shell: true,
  stdio: "inherit",
  env: { ...process.env, VITE_DEV_SERVER_URL: "http://127.0.0.1:5188/" },
});

const shutdown = () => {
  electron.kill();
  vite.kill();
  process.exit(0);
};
electron.on("exit", () => {
  vite.kill();
  process.exit(0);
});
process.on("SIGINT", shutdown);
