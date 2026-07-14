import React, { useState, useEffect } from "react";
import { LogIn, Loader2 } from "lucide-react";
import { login } from "./api.js";
import Logo from "./Logo.jsx";

const INK = "#1B1512";
const SUB = "#5E5049";
const BORDER = "#E7DFD4";

const FONT =
  "'Manrope', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Экран входа. При успехе вызывает onSuccess(user).
export default function Login({ onSuccess }) {
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [brand, setBrand] = useState("Avesto Group");
  // Название бренда — с сервера (конфигурация организации, публичная часть).
  useEffect(() => {
    const base = import.meta.env.VITE_API_URL || "";
    fetch(`${base}/api/org/public`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && d.brandName && setBrand(d.brandName))
      .catch(() => {});
  }, []);

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
    background: "rgba(255,255,255,.85)",
  };

  return (
    <div
      className="min-h-dvh flex items-center justify-center p-4"
      style={{
        fontFamily: FONT,
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(900px 520px at 12% -10%, rgba(200,137,46,0.14), transparent 60%)," +
          "radial-gradient(820px 620px at 100% 0%, rgba(123,45,31,0.12), transparent 55%)," +
          "linear-gradient(180deg, #FBF8F3 0%, #F3ECE2 100%)",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
        @keyframes lgUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
        @keyframes lgBlobA{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(48px,-38px) scale(1.18)}}
        @keyframes lgBlobB{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-40px,48px) scale(1.12)}}
        @keyframes lgBlobC{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(28px,28px) scale(1.1)}}
        .lg-blob{position:absolute;border-radius:50%;filter:blur(60px);pointer-events:none;will-change:transform;z-index:0}
        .lg-in{transition:border-color .18s ease,box-shadow .18s ease}
        .lg-in:focus{border-color:#B4704F;box-shadow:0 0 0 4px rgba(180,112,79,.16)}
        .lg-btn{position:relative;overflow:hidden;transition:transform .12s ease,box-shadow .2s ease,opacity .2s}
        .lg-btn::after{content:"";position:absolute;top:0;left:0;width:55%;height:100%;transform:translateX(-160%) skewX(-18deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent)}
        .lg-btn:hover:not(:disabled){transform:translateY(-1px)}
        .lg-btn:hover:not(:disabled)::after{animation:lgSheen .9s ease}
        @keyframes lgSheen{to{transform:translateX(240%) skewX(-18deg)}}
        @media(prefers-reduced-motion:reduce){.lg-blob{animation:none!important}}`}</style>

      {/* Мягко дрейфующие «ауроры» на фоне — оживляют экран входа, не отвлекая. */}
      <div
        className="lg-blob"
        style={{
          width: 340,
          height: 340,
          left: "-6%",
          top: "-10%",
          background: "rgba(200,137,46,.28)",
          animation: "lgBlobA 15s ease-in-out infinite",
        }}
      />
      <div
        className="lg-blob"
        style={{
          width: 380,
          height: 380,
          right: "-8%",
          top: "-4%",
          background: "rgba(123,45,31,.22)",
          animation: "lgBlobB 19s ease-in-out infinite",
        }}
      />
      <div
        className="lg-blob"
        style={{
          width: 300,
          height: 300,
          left: "28%",
          bottom: "-16%",
          background: "rgba(124,58,237,.14)",
          animation: "lgBlobC 17s ease-in-out infinite",
        }}
      />
      <div
        className="w-full max-w-sm rounded-2xl p-6 sm:p-7"
        style={{
          border: "1px solid rgba(255,255,255,.7)",
          background: "rgba(255,255,255,.62)",
          backdropFilter: "blur(22px) saturate(160%)",
          WebkitBackdropFilter: "blur(22px) saturate(160%)",
          boxShadow:
            "0 20px 60px rgba(74,38,22,.16), inset 0 1px 0 rgba(255,255,255,.6)",
          animation: "lgUp .5s cubic-bezier(.22,.61,.36,1) both",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div className="flex items-center gap-3 mb-5">
          <Logo size={44} radius={11} />
          <div>
            <div
              className="font-extrabold"
              style={{ color: INK, fontSize: 17, lineHeight: 1.2 }}
            >
              {brand}
            </div>
            <div style={{ color: SUB, fontSize: 12.5 }}>CRM System</div>
          </div>
        </div>

        <h1
          className="font-extrabold mb-1"
          style={{ color: INK, fontSize: 20 }}
        >
          Вход в систему
        </h1>
        <p className="mb-5" style={{ color: SUB, fontSize: 13.5 }}>
          Введите логин и пароль вашей учётной записи.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label
              className="block mb-1 font-semibold"
              style={{ color: SUB, fontSize: 13 }}
            >
              Логин
            </label>
            <input
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
              autoFocus
              autoComplete="username"
              className="lg-in w-full rounded-xl px-3.5 py-2.5 focus:outline-none"
              style={inputStyle}
              placeholder="например, director"
            />
          </div>
          <div>
            <label
              className="block mb-1 font-semibold"
              style={{ color: SUB, fontSize: 13 }}
            >
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="lg-in w-full rounded-xl px-3.5 py-2.5 focus:outline-none"
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
            className="lg-btn w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold text-white"
            style={{
              background:
                "linear-gradient(135deg, #8A3323 0%, #7B2D1F 55%, #5E2016 100%)",
              fontSize: 15,
              opacity: busy ? 0.7 : 1,
              boxShadow: "0 10px 26px rgba(123,45,31,.34)",
              transition:
                "transform .12s ease, box-shadow .2s ease, opacity .2s",
            }}
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <LogIn size={18} />
            )}
            {busy ? "Вход…" : "Войти"}
          </button>
        </form>

        <div
          className="mt-5 rounded-xl px-3 py-2.5"
          style={{
            background: "#F6EFE1",
            fontSize: 12,
            color: SUB,
            lineHeight: 1.5,
          }}
        >
          Сотрудники входят своим <b>логином и паролем из iiko</b>. Если пароль
          iiko не подошёл — используйте временный (табельный номер) и смените
          его при входе.
          <br />
          Служебная учётка администратора: <b>sysadmin</b> — пароль{" "}
          <b>changeme123</b> (сменить после первого входа).
        </div>
      </div>
    </div>
  );
}
