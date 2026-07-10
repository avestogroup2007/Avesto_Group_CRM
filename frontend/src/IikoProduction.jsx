import React, { useState } from "react";
import { apiGet } from "./api.js";

const INK = "#1B1512";
const SUB = "#5E5049";
const FAINT = "#8A7C72";
const BORDER = "#E7DFD4";
const LINE = "#F0EAE1";
const BRAND = "#7B2D1F";
const BAD = "#DC2626";

// Панель «Акт приготовления»: этап 1 — ЧТЕНИЕ справочников из iiko (блюда с
// тех.картами и склады). Загружаем по кнопке, показываем списки и счётчики,
// чтобы убедиться, что данные верные. Создание акта добавим следующим этапом.
export default function IikoProduction() {
  const [state, setState] = useState({ kind: "idle" }); // idle|loading|ok|error
  const [q, setQ] = useState("");

  const load = async () => {
    setState({ kind: "loading" });
    try {
      const data = await apiGet("/api/iiko/production/refs");
      setState({ kind: "ok", data });
    } catch (e) {
      setState({ kind: "error", msg: e.message || "Ошибка запроса к iiko" });
    }
  };

  const box = {
    border: `1px solid ${BORDER}`,
    borderRadius: 16,
    background: "#fff",
    padding: 18,
  };
  const th = {
    fontSize: 11,
    color: FAINT,
    fontWeight: 700,
    textAlign: "left",
    padding: "6px 8px",
    borderBottom: `1px solid ${BORDER}`,
    whiteSpace: "nowrap",
  };
  const td = {
    fontSize: 13,
    color: INK,
    padding: "6px 8px",
    borderBottom: `1px solid ${LINE}`,
  };

  const data = state.kind === "ok" ? state.data : null;
  const products = data ? data.products || [] : [];
  const stores = data ? data.stores || [] : [];
  const needle = q.trim().toLowerCase();
  const shownProducts = needle
    ? products.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(needle) ||
          (p.num || "").toLowerCase().includes(needle) ||
          (p.code || "").toLowerCase().includes(needle),
      )
    : products;

  return (
    <div style={box}>
      <div className="flex items-center flex-wrap gap-2 justify-between">
        <div>
          <h3 className="font-bold" style={{ color: INK, fontSize: 15 }}>
            Акт приготовления · данные из iiko
          </h3>
          <p
            style={{ fontSize: 12.5, color: SUB, marginTop: 2, maxWidth: 640 }}
          >
            Этап 1 — проверка чтения. Загружаем из iiko блюда и заготовки с
            тех.картой (их можно «приготовить») и список складов. Ничего не
            меняем в iiko. Убедимся, что данные верные — затем добавим саму
            форму создания акта.
          </p>
        </div>
        <button
          onClick={load}
          disabled={state.kind === "loading"}
          className="rounded-xl px-4 py-2 font-semibold"
          style={{
            background: BRAND,
            color: "#fff",
            fontSize: 13,
            opacity: state.kind === "loading" ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {state.kind === "loading" ? "Загрузка…" : "Загрузить из iiko"}
        </button>
      </div>

      {state.kind === "error" && (
        <div
          className="mt-3 rounded-xl px-3 py-2"
          style={{ background: "#FEE2E2", color: BAD, fontSize: 12.5 }}
        >
          {state.msg}
        </div>
      )}

      {data && (
        <>
          <div className="flex flex-wrap gap-2 mt-3 mb-2">
            <span
              className="rounded-full px-3 py-1"
              style={{
                background: LINE,
                color: SUB,
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              Блюд/заготовок: {data.productCount ?? products.length}
            </span>
            <span
              className="rounded-full px-3 py-1"
              style={{
                background: LINE,
                color: SUB,
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              Складов: {data.storeCount ?? stores.length}
            </span>
          </div>

          {/* Диагностика: если списки пустые — образцы сырого ответа iiko. */}
          {data.productsSample && (
            <details className="mt-2" style={{ fontSize: 12, color: FAINT }}>
              <summary>Блюда не распознаны — образец ответа iiko</summary>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
                {data.productsSample}
              </pre>
            </details>
          )}
          {data.storesSample && (
            <details className="mt-2" style={{ fontSize: 12, color: FAINT }}>
              <summary>Склады не распознаны — образец ответа iiko</summary>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
                {data.storesSample}
              </pre>
            </details>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
            {/* Склады */}
            <div>
              <h4
                className="font-bold mb-2"
                style={{ color: INK, fontSize: 13.5 }}
              >
                Склады
              </h4>
              <div style={{ maxHeight: 320, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Название</th>
                      <th style={th}>Код</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stores.map((s) => (
                      <tr key={s.id}>
                        <td style={td}>{s.name}</td>
                        <td style={{ ...td, color: FAINT }}>{s.code || "—"}</td>
                      </tr>
                    ))}
                    {!stores.length && (
                      <tr>
                        <td style={td} colSpan={2}>
                          Складов не получено.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Блюда/заготовки */}
            <div>
              <div className="flex items-center justify-between mb-2 gap-2">
                <h4
                  className="font-bold"
                  style={{ color: INK, fontSize: 13.5 }}
                >
                  Блюда и заготовки
                </h4>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="поиск…"
                  style={{
                    border: `1px solid ${BORDER}`,
                    borderRadius: 10,
                    padding: "5px 10px",
                    fontSize: 12.5,
                    width: 150,
                  }}
                />
              </div>
              <div style={{ maxHeight: 320, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Название</th>
                      <th style={th}>Артикул</th>
                      <th style={th}>Тип</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownProducts.slice(0, 300).map((p) => (
                      <tr key={p.id}>
                        <td style={td}>{p.name}</td>
                        <td style={{ ...td, color: FAINT }}>{p.num || "—"}</td>
                        <td style={{ ...td, color: FAINT }}>
                          {p.type === "PREPARED" ? "заготовка" : "блюдо"}
                        </td>
                      </tr>
                    ))}
                    {!shownProducts.length && (
                      <tr>
                        <td style={td} colSpan={3}>
                          Блюд не получено.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {shownProducts.length > 300 && (
                <p style={{ fontSize: 11.5, color: FAINT, marginTop: 6 }}>
                  Показаны первые 300 из {shownProducts.length}. Уточните поиск.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
