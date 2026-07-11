import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
// base задаётся под GitHub Pages (проектный путь /Avesto_Group_CRM/) через
// переменную VITE_BASE в workflow деплоя; локально остаётся "/".
// Content-Security-Policy вставляется только в собранный index.html (в dev
// Vite использует inline-скрипты и WebSocket — политика бы их сломала).
// Разрешено ровно то, что использует приложение: свои скрипты, инлайн-стили
// React, шрифты Google, картинки data:/blob: (сжатые фото) и запросы к API.
function cspPlugin() {
  const api = process.env.VITE_API_URL || "";
  const connect = ["'self'", api].filter(Boolean).join(" ");
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  return {
    name: "inject-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "<meta charset=",
        `<meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <meta charset=`,
      );
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react(), tailwindcss(), cspPlugin()],
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
