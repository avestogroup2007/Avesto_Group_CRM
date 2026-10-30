// Дизайн-токены и фазы заявок — общая тема интерфейса.
export const FONT =
  "'Manrope', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Серифный «плакатный» шрифт для крупных цифр и заголовков (тёплая тема
// «жидкое стекло»). Fraunces — тёплый характерный serif; при недоступности
// откатывается на системные serif.
export const SERIF =
  "'Fraunces', 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";

// ── Палитры ─────────────────────────────────────────────────────────────────
// Светлая — исторический стандарт системы, значения не менялись.
// Тёмная — для долгой работы и вечерних смен (skill ui-ux-pro-max: для
// финансовых дашбордов «светлая тема по умолчанию» помечена как анти-паттерн,
// severity HIGH). Тёмная намеренно ТЁПЛАЯ, а не серо-синяя: бренд Avesto
// остаётся узнаваемым. Бордовый #7B2D1F на тёмном фоне не проходит по
// контрасту, поэтому в тёмной теме бренд-акцент осветлён до терракотового.
const LIGHT = {
  bg: "#F7F4EF",
  surface: "#FFFFFF",
  ink: "#1B1512",
  sub: "#5E5049",
  faint: "#A2938B",
  border: "#E7DFD4",
  line: "#F1EBE2",
  brandA: "#7B2D1F",
  brandB: "#C8892E",
  gold: "#C8892E",
  goldBright: "#E4A93C",
  violet: "#7C3AED",
  ok: "#16A34A",
  warn: "#D97706",
  bad: "#DC2626",
  // Стеклянные поверхности (используются через классы .glass* в глобальном CSS).
  // Тёплая тема «жидкое стекло»: поверхности заметнее и «сочнее».
  glass: "rgba(255,255,255,0.64)",
  glassStrong: "rgba(255,252,247,0.84)",
  glassBorder: "rgba(255,255,255,0.80)",
  glassShadow: "0 14px 42px rgba(74,38,22,0.13), 0 2px 8px rgba(74,38,22,0.06)",
  // Фирменный градиент для основных кнопок и акцентов.
  brandGrad: "linear-gradient(135deg, #8A3323 0%, #7B2D1F 55%, #5E2016 100%)",
  // Кольцо фокуса и схема для системных элементов (скроллбары, поля ввода).
  ring: "#7B2D1F",
  scheme: "light",
};

const DARK = {
  bg: "#17120F",
  surface: "#211B17",
  ink: "#F6F0E8",
  sub: "#C3B4A9",
  faint: "#9B8B80",
  border: "#362D27",
  line: "#2A231E",
  brandA: "#E8806A",
  brandB: "#E4A93C",
  gold: "#E4A93C",
  goldBright: "#F2C05A",
  violet: "#A98BFF",
  ok: "#3DD17F",
  warn: "#F0A93A",
  bad: "#FF7A68",
  glass: "rgba(33,27,23,0.66)",
  glassStrong: "rgba(28,23,19,0.88)",
  glassBorder: "rgba(255,240,226,0.10)",
  glassShadow: "0 14px 42px rgba(0,0,0,0.46), 0 2px 8px rgba(0,0,0,0.30)",
  brandGrad: "linear-gradient(135deg, #A33E2A 0%, #8A3323 55%, #6B2619 100%)",
  ring: "#E8806A",
  scheme: "dark",
};

// Живой объект токенов: все 33 экрана импортируют именно его и читают поля во
// время рендера. Переключение темы мутирует поля на месте — поэтому новые
// цвета подхватываются без правки компонентов (React.memo в проекте не
// используется, смена настройки перерисовывает дерево целиком).
export const C = { ...LIGHT };

// 5 фаз жизненного цикла заявки — каждая со своим цветом.
// soft — заливка плашки; в тёмной теме светлые пастели слепят, поэтому там
// используются затемнённые версии тех же оттенков.
const PHASES_LIGHT = [
  { n: 1, label: "Отправлено", color: "#2563EB", soft: "#EFF4FF" },
  { n: 2, label: "Просмотрено", color: "#7C3AED", soft: "#F5F0FE" },
  { n: 3, label: "В работе", color: "#EA580C", soft: "#FFF2E8" },
  { n: 4, label: "На проверке", color: "#DB2777", soft: "#FCEEF5" },
  { n: 5, label: "Завершено", color: "#16A34A", soft: "#E9F9EF" },
];

const PHASES_DARK = [
  { n: 1, label: "Отправлено", color: "#7AA7FF", soft: "#1B2338" },
  { n: 2, label: "Просмотрено", color: "#A98BFF", soft: "#241E3A" },
  { n: 3, label: "В работе", color: "#FF9A5C", soft: "#33220F" },
  { n: 4, label: "На проверке", color: "#F472B6", soft: "#331A26" },
  { n: 5, label: "Завершено", color: "#3DD17F", soft: "#132A1E" },
];

export const PHASES = PHASES_LIGHT.map((p) => ({ ...p }));

export let THEME = "light";

// Применяет тему из настроек. Вызывается при рендере App — рядом с syncLang,
// по тому же принципу: мутирует общий объект до отрисовки детей.
export function syncTheme(s) {
  const want =
    (s && s.settings && s.settings.theme) === "dark" ? "dark" : "light";
  if (want === THEME) return;
  THEME = want;
  const palette = want === "dark" ? DARK : LIGHT;
  Object.assign(C, palette);
  const phases = want === "dark" ? PHASES_DARK : PHASES_LIGHT;
  phases.forEach((p, i) => Object.assign(PHASES[i], p));
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.dataset.theme = want;
    // color-scheme красит системные элементы (скроллбары, автозаполнение,
    // нативный календарь) — без неё в тёмной теме они остаются белыми.
    root.style.colorScheme = palette.scheme;
    root.style.setProperty("--ring", palette.ring);
    root.style.setProperty("--bg", palette.bg);
  }
}
