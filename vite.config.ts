import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 渲染进程构建：产物为纯静态文件，由 Electron 以 file:// 方式加载
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5188,
    strictPort: true,
  },
});
