import React, { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "./api.js";

const MAROON = "#7B2D1F";
const INK = "#1B1512";
const SUB = "#5E5049";
const BORDER = "#E7DFD4";
const OK = "#16A34A";

// Панель проверки подключения iiko: статус ключа + список точек (organizationId).
// Различает три состояния: ключ настроен / не настроен / сервер не ответил.
export default function IikoPanel() {
  const [state, setState] = useState({ kind: "loading" }); // loading|ok|off|error
  const [orgs, setOrgs] = useState(null);
  const [ordersErr, setOrdersErr] = useState("");
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const data = await apiGet("/api/iiko/status");
      setState({ kind: data.configured ? "ok" : "off" });
    } catch (e) {
      setState({ kind: "error", msg: e.message || "нет связи с сервером" });
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const loadOrgs = async () => {
    setBusy(true);
    setOrdersErr("");
    try {
      const data = await apiPost("/api/iiko/organizations", {});
      const list =
        data.organizations || data.data || (Array.isArray(data) ? data : []);
      setOrgs(list);
    } catch (e) {
      setOrdersErr(e.message || "Не удалось получить точки iiko");
    } finally {
      setBusy(false);
    }
  };

  const dot = (color) => (
    <span
      style={{ width: 9, height: 9, borderRadius: 9, background: color, display: "inline-block" }}
    />
  );

  const head = {
    loading: { color: "#CBBFB4", text: "проверка…" },
    ok: { color: OK, text: "ключ настроен" },
    off: { color: "#B45309", text: "ключ не настроен на сервере" },
    error: { color: "#DC2626", text: "сервер не ответил" },
  }[state.kind];

  return (
    <div className="rounded-2xl bg-white p-4 sm:p-5" style={{ border: `1px solid ${BORDER}` }}>
      <div className="flex items-center flex-wrap gap-2 justify-between">
        <div className="flex items-center gap-2">
          {dot(head.color)}
          <h3 className="font-bold" style={{ color: INK, fontSize: 15 }}>
            Подключение iiko
          </h3>
          <span style={{ fontSize: 12.5, color: SUB }}>{head.text}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={check}
            className="rounded-xl px-3 py-2 font-semibold"
            style={{ border: `1px solid ${BORDER}`, color: SUB, fontSize: 12.5 }}
          >
            Проверить снова
          </button>
          {state.kind === "ok" && (
            <button
              onClick={loadOrgs}
              disabled={busy}
              className="rounded-xl px-3.5 py-2 font-bold text-white"
              style={{ background: MAROON, fontSize: 13, opacity: busy ? 0.7 : 1 }}
            >
              {busy ? "Загрузка…" : "Показать точки iiko"}
            </button>
          )}
        </div>
      </div>

      {state.kind === "off" && (
        <p className="mt-2" style={{ fontSize: 12.5, color: SUB, lineHeight: 1.5 }}>
          Ключ <b>IIKO_API_LOGIN</b> есть в Render, но сервер запущен без него —
          нажмите в Render <b>Manual Deploy → Deploy latest commit</b>, дождитесь
          статуса <b>Live</b> и здесь «Проверить снова».
        </p>
      )}
      {state.kind === "error" && (
        <p className="mt-2" style={{ fontSize: 12.5, color: SUB, lineHeight: 1.5 }}>
          Не удалось связаться с сервером ({state.msg}). Бесплатный сервер мог
          «уснуть» — подождите ~30 сек и нажмите «Проверить снова».
        </p>
      )}

      {ordersErr && (
        <div
          className="mt-3 rounded-xl px-3 py-2"
          style={{ background: "#FEECEC", color: "#DC2626", fontSize: 12.5, border: "1px solid #FBD5D5" }}
        >
          Ошибка: {ordersErr}
        </div>
      )}

      {orgs && (
        <div className="mt-3">
          <div style={{ fontSize: 12, color: SUB, fontWeight: 700, marginBottom: 6 }}>
            Точки iiko ({orgs.length}) — их <b>id</b> нужны для привязки к филиалам:
          </div>
          <div className="space-y-1.5">
            {orgs.length === 0 && (
              <div style={{ fontSize: 12.5, color: SUB }}>Точки не найдены.</div>
            )}
            {orgs.map((o) => (
              <div
                key={o.id}
                className="flex items-center flex-wrap gap-x-3 gap-y-0.5 rounded-xl px-3 py-2"
                style={{ background: "#FBF8F2", border: `1px solid ${BORDER}` }}
              >
                <span style={{ fontSize: 13.5, color: INK, fontWeight: 700 }}>
                  {o.name || "(без названия)"}
                </span>
                <span style={{ fontSize: 11.5, color: SUB, fontFamily: "monospace" }}>
                  {o.id}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
