import React, { useState } from "react";
import { ShieldCheck, LogIn, Loader2 } from "lucide-react";
import { login } from "./api.js";

const BRAND_A = "#2563EB";
const BRAND_B = "#06B6D4";
const INK = "#0F172A";
const SUB = "#475569";
const BORDER = "#E5EAF2";

const FONT =
  "'Manrope', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Экран входа. При успехе вызывает onSuccess(user).
export default function Login({ onSuccess }) {
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!loginName.trim() || !password) {
      setErr("Введите логин и пароль");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const user = await login(loginName.trim(), password);
      onSuccess(user);
    } catch (e2) {
      setErr(e2.message || "Не удалось войти");
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

  return (
    <div
      className="min-h-dvh flex items-center justify-center p-4"
      style={{ fontFamily: FONT, background: "#F4F6FB" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 sm:p-7"
        style={{ border: `1px solid ${BORDER}`, boxShadow: "0 10px 40px rgba(15,23,42,.08)" }}
      >
        <div className="flex items-center gap-3 mb-5">
          <div
            className="rounded-xl flex items-center justify-center shrink-0"
            style={{ width: 40, height: 40, background: `linear-gradient(135deg, ${BRAND_A}, ${BRAND_B})` }}
          >
            <ShieldCheck size={22} color="#fff" />
          </div>
          <div>
            <div className="font-extrabold" style={{ color: INK, fontSize: 17, lineHeight: 1.2 }}>
              Avesto Group
            </div>
            <div style={{ color: SUB, fontSize: 12.5 }}>CRM System</div>
          </div>
        </div>

        <h1 className="font-extrabold mb-1" style={{ color: INK, fontSize: 20 }}>
          Вход в систему
        </h1>
        <p className="mb-5" style={{ color: SUB, fontSize: 13.5 }}>
          Введите логин и пароль вашей учётной записи.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block mb-1 font-semibold" style={{ color: SUB, fontSize: 13 }}>
              Логин
            </label>
            <input
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
              autoFocus
              autoComplete="username"
              className="w-full rounded-xl px-3.5 py-2.5 focus:outline-none"
              style={inputStyle}
              placeholder="например, director"
            />
          </div>
          <div>
            <label className="block mb-1 font-semibold" style={{ color: SUB, fontSize: 13 }}>
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-xl px-3.5 py-2.5 focus:outline-none"
              style={inputStyle}
              placeholder="••••••••"
            />
          </div>

          {err && (
            <div
              className="rounded-xl px-3 py-2"
              style={{ background: "#FEECEC", color: "#DC2626", fontSize: 13, border: "1px solid #FBD5D5" }}
            >
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold text-white"
            style={{ background: BRAND_A, fontSize: 15, opacity: busy ? 0.7 : 1 }}
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
            {busy ? "Вход…" : "Войти"}
          </button>
        </form>

        <div
          className="mt-5 rounded-xl px-3 py-2.5"
          style={{ background: "#F1F5FD", fontSize: 12, color: SUB, lineHeight: 1.5 }}
        >
          Демо-учётки: <b>director</b>, <b>finance</b>, <b>manager</b>, <b>accountant</b>,{" "}
          <b>sysadmin</b>, <b>staff</b> — пароль <b>changeme123</b>.
        </div>
      </div>
    </div>
  );
}
