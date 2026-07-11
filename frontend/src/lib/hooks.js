// Общие React-хуки. usePersisted — состояние, переживающее перезагрузку
// страницы (localStorage).
import { useState, useEffect } from "react";

// Состояние, сохраняемое в localStorage — переживает обновление страницы.
export function usePersisted(key, initial) {
  const [v, setV] = useState(() => {
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(key);
        if (raw != null) return JSON.parse(raw);
      }
    } catch {
      /* игнорируем битые значения */
    }
    return initial;
  });
  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined")
        localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* приватный режим и т.п. — просто не сохраняем */
    }
  }, [key, v]);
  return [v, setV];
}
