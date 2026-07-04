import React, { useCallback, useEffect, useState } from "react";
import { apiGet } from "./api.js";

const INK = "#1B1512";
const SUB = "#5E5049";
const BORDER = "#E7DFD4";
const OK = "#16A34A";

// Панель подключения iiko (iikoServer). Показывает три состояния:
// ключ настроен / не настроен на сервере / сервер не ответил.
export default function IikoPanel() {
  const [state, setState] = useState({ kind: "loading" }); // loading|ok|off|error

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

  const dot = (color) => (
    <span
      style={{ width: 9, height: 9, borderRadius: 9, background: color, display: "inline-block" }}
    />
  );

  const head = {
    loading: { color: "#CBBFB4", text: "проверка…" },
    ok: { color: OK, text: "подключение настроено" },
    off: { color: "#B45309", text: "не настроено на сервере" },
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
        <button
          onClick={check}
          className="rounded-xl px-3 py-2 font-semibold"
          style={{ border: `1px solid ${BORDER}`, color: SUB, fontSize: 12.5 }}
        >
          Проверить снова
        </button>
      </div>

      {state.kind === "ok" && (
        <p className="mt-2" style={{ fontSize: 12.5, color: SUB, lineHeight: 1.5 }}>
          Сервер iiko подключён. Реальные продажи подтягиваются в отчёте
          <b> «Динамика выручки»</b> за выбранный период.
        </p>
      )}
      {state.kind === "off" && (
        <p className="mt-2" style={{ fontSize: 12.5, color: SUB, lineHeight: 1.5 }}>
          Не заданы <b>IIKO_SERVER_URL</b>, <b>IIKO_SERVER_LOGIN</b> и
          <b> IIKO_SERVER_PASSWORD</b> в окружении сервера (Render). Добавьте их,
          сделайте <b>Deploy</b> и нажмите «Проверить снова».
        </p>
      )}
      {state.kind === "error" && (
        <p className="mt-2" style={{ fontSize: 12.5, color: SUB, lineHeight: 1.5 }}>
          Не удалось связаться с сервером ({state.msg}). Бесплатный сервер мог
          «уснуть» — подождите ~30 сек и нажмите «Проверить снова».
        </p>
      )}
    </div>
  );
}
