import React, { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { changePassword } from "./api.js";
import Logo from "./Logo.jsx";

const BRAND_A = "#7B2D1F";
const INK = "#1B1512";
const SUB = "#5E5049";
const BORDER = "#E7DFD4";
const FONT =
  "'Manrope', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Обязательная смена пароля при первом входе (mustChangePassword).
// При успехе вызывает onDone(). Выхода нет — пока пароль не сменён, дальше
// приложение не пускает.
export default function ChangePassword({ user, onDone }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!current || !next) {
      setErr("Заполните текущий и новый пароль");
      return;
    }
    if (next.length < 6) {
      setErr("Новый пароль — минимум 6 символов");
      return;
    }
    if (next !== confirm) {
      setErr("Новый пароль и подтверждение не совпадают");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await changePassword(current, next);
      onDone();
    } catch (e2) {
      setErr(e2.message || "Не удалось сменить пароль");
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    border: `1px solid ${BORDER}`,
    fontSize: 15,
    color: INK,
    background: "#fff",
  };
  const label = { color: SUB, fontSize: 13 };

  return (
    <div
      className="min-h-dvh flex items-center justify-center p-4"
      style={{ fontFamily: FONT, background: "#F7F4EF" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 sm:p-7"
        style={{
          border: `1px solid ${BORDER}`,
          boxShadow: "0 10px 40px rgba(15,23,42,.08)",
        }}
      >
        <div className="flex items-center gap-3 mb-5">
          <Logo size={44} radius={11} />
          <div>
            <div
              className="font-extrabold"
              style={{ color: INK, fontSize: 17, lineHeight: 1.2 }}
            >
              Avesto Group
            </div>
            <div style={{ color: SUB, fontSize: 12.5 }}>CRM System</div>
          </div>
        </div>

        <h1
          className="font-extrabold mb-1"
          style={{ color: INK, fontSize: 20 }}
        >
          Смена пароля
        </h1>
        <p className="mb-5" style={{ color: SUB, fontSize: 13.5 }}>
          {user?.displayName ? `${user.displayName}, ` : ""}это ваш первый вход
          — задайте новый пароль вместо временного.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block mb-1 font-semibold" style={label}>
              Текущий (временный) пароль
            </label>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoFocus
              autoComplete="current-password"
              className="w-full rounded-xl px-3.5 py-2.5 focus:outline-none"
              style={inputStyle}
              placeholder="например, табельный номер"
            />
          </div>
          <div>
            <label className="block mb-1 font-semibold" style={label}>
              Новый пароль
            </label>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-xl px-3.5 py-2.5 focus:outline-none"
              style={inputStyle}
              placeholder="минимум 6 символов"
            />
          </div>
          <div>
            <label className="block mb-1 font-semibold" style={label}>
              Повторите новый пароль
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-xl px-3.5 py-2.5 focus:outline-none"
              style={inputStyle}
              placeholder="••••••••"
            />
          </div>

          {err && (
            <div
              className="rounded-xl px-3 py-2"
              style={{
                background: "#FEECEC",
                color: "#DC2626",
                fontSize: 13,
                border: "1px solid #FBD5D5",
              }}
            >
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold text-white"
            style={{
              background: BRAND_A,
              fontSize: 15,
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <KeyRound size={18} />
            )}
            {busy ? "Сохранение…" : "Сменить пароль и войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
