import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 開發伺服器設定
// - server.proxy:本機開發時,前端跑在 5173,把 /api 的請求代理到後端 8000,
//   這樣前端程式裡一律用相對路徑 /api/...,跟正式環境(Caddy 反代)行為一致。
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
