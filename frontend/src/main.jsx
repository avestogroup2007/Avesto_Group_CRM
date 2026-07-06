import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Login from "./Login.jsx";
import ChangePassword from "./ChangePassword.jsx";
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

// Подушка безопасности: если где-то в дереве React упадёт рендер, показываем
// текст ошибки вместо пустого белого экрана (и даём кнопку перезагрузки).
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    return (
      <div
        style={{
          minHeight: "100dvh",
          padding: 24,
          background: "#F7F4EF",
          color: "#1B1512",
          fontFamily: "'Manrope', system-ui, sans-serif",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
          Что-то пошло не так на экране
        </h2>
        <p style={{ fontSize: 13, color: "#5E5049", marginBottom: 12 }}>
          Приложение поймало ошибку и не закрылось. Пришлите этот текст —
          поправим:
        </p>
        <pre
          style={{
            fontSize: 12,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "#fff",
            border: "1px solid #E7DFD4",
            borderRadius: 12,
            padding: 12,
            color: "#7B2D1F",
          }}
        >
          {String(e && e.message ? e.message : e)}
          {"\n\n"}
          {String((e && e.stack) || "")
            .split("\n")
            .slice(0, 6)
            .join("\n")}
        </pre>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 12,
            border: "none",
            background: "#7B2D1F",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            padding: "8px 14px",
            borderRadius: 12,
            cursor: "pointer",
          }}
        >
          Перезагрузить
        </button>
      </div>
    );
  }
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
          background: "#F7F4EF",
          color: "#5E5049",
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

  // Первый вход по временному паролю — сначала обязательная смена пароля.
  if (state.user.mustChangePassword) {
    return (
      <ChangePassword
        user={state.user}
        onDone={() =>
          setState((s) => ({
            ...s,
            user: { ...s.user, mustChangePassword: false },
          }))
        }
      />
    );
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
    <ErrorBoundary>
      <AuthGate />
    </ErrorBoundary>
  </React.StrictMode>,
);
