import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Прототип сохраняет данные через window.storage (async KV). В обычном браузере
// его нет — подставляем совместимый shim на localStorage, чтобы данные
// сохранялись между сессиями. На Этапе 8 store переключится на серверный API.
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async get(key) {
      const value = localStorage.getItem(key);
      return value == null ? null : { value };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
    },
  };
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
