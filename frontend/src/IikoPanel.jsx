import React, { useEffect, useState } from "react";
import { apiGet, apiPost } from "./api.js";

const MAROON = "#7B2D1F";
const INK = "#1B1512";
const SUB = "#5E5049";
const BORDER = "#E7DFD4";
const OK = "#16A34A";

// Панель проверки подключения iiko: статус ключа + список точек (organizationId).
// Помогает убедиться, что apiLogin работает, и получить id точек для
// сопоставления с филиалами.
export default function IikoPanel() {
  const [status, setStatus] = useState(null); // { configured } | { error }
  const [orgs, setOrgs] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet("/api/iiko/status")
      .then(setStatus)
      .catch(() => setStatus({ configured: false, error: true }));
  }, []);

  const loadOrgs = async () => {
    setBusy(true);
    setErr("");
    try {
      const data = await apiPost("/api/iiko/organizations", {});
      const list = data.organizations || data.data || (Array.isArray(data) ? data : []);
      setOrgs(list);
    } catch (e) {
      setErr(e.message || "Не удалось получить точки iiko");
    } finally {
      setBusy(false);
    }
  };

  const dot = (color) => (
    <span style={{ width: 9, height: 9, borderRadius: 9, background: color, display: "inline-block" }} />
  );

  return (
    <div className="rounded-2xl bg-white p-4 sm:p-5" style={{ border: `1px solid ${BORDER}` }}>
      <div className="flex items-center flex-wrap gap-2 justify-between">
        <div className="flex items-center gap-2">
          {status == null
            ? dot("#CBBFB4")
            : status.configured
              ? dot(OK)
              : dot("#B45309")}
          <h3 className="font-bold" style={{ color: INK, fontSize: 15 }}>
            Подключение iiko
          </h3>
          <span style={{ fontSize: 12.5, color: SUB }}>
            {status == null
              ? "проверка…"
              : status.configured
                ? "ключ настроен"
                : "ключ не настроен на сервере"}
          </span>
        </div>
        {status?.configured && (
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

      {!status?.configured && status != null && (
        <p className="mt-2" style={{ fontSize: 12.5, color: SUB, lineHeight: 1.5 }}>
          Добавьте переменную <b>IIKO_API_LOGIN</b> в окружении бэкенда (Render →
          Environment). После этого здесь появятся ваши точки.
        </p>
      )}

      {err && (
        <div
          className="mt-3 rounded-xl px-3 py-2"
          style={{ background: "#FEECEC", color: "#DC2626", fontSize: 12.5, border: "1px solid #FBD5D5" }}
        >
          Ошибка: {err}
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
