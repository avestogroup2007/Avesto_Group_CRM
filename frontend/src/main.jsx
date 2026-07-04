import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Login from "./Login.jsx";
import { me, logout } from "./api.js";
import "./index.css";

// Прототип сохраняет данные через window.storage (async KV). В обычном браузере
// его нет — подставляем совместимый shim на localStorage, чтобы данные
// сохранялись между сессиями. Следующие срезы переносят данные на сервер.
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

// Гейт авторизации: сначала спрашиваем «кто я» по токену; нет входа — экран
// входа; есть — приложение под реальной ролью с сервера.
function AuthGate() {
  const [state, setState] = useState({ loading: true, user: null });

  useEffect(() => {
    me().then((user) => setState({ loading: false, user }));
  }, []);

  if (state.loading) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F4F6FB",
          color: "#475569",
          fontFamily: "'Manrope', system-ui, sans-serif",
          fontSize: 14,
        }}
      >
        Загрузка…
      </div>
    );
  }

  if (!state.user) {
    return <Login onSuccess={(user) => setState({ loading: false, user })} />;
  }

  return (
    <App
      authUser={state.user}
      onLogout={async () => {
        await logout();
        setState({ loading: false, user: null });
      }}
    />
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthGate />
  </React.StrictMode>
);
