import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
// base задаётся под GitHub Pages (проектный путь /Avesto_Group_CRM/) через
// переменную VITE_BASE в workflow деплоя; локально остаётся "/".
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Прокси на бэкенд (Этап 8: переключение store на API).
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
