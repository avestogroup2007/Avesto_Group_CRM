// Дизайн-токены и фазы заявок — общая тема интерфейса.
export const FONT =
  "'Manrope', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Дизайн-токены: высокий контраст, доступность для всех поколений (Этап 3).
// Плюс «жидкое стекло»: полупрозрачные матовые поверхности для хрома (боковое
// меню, шапка, нижняя навигация, модалки) поверх тёплого градиентного фона.
export const C = {
  bg: "#F7F4EF",
  surface: "#FFFFFF",
  ink: "#1B1512",
  sub: "#5E5049",
  faint: "#A2938B",
  border: "#E7DFD4",
  line: "#F1EBE2",
  brandA: "#7B2D1F",
  brandB: "#C8892E",
  violet: "#7C3AED",
  ok: "#16A34A",
  warn: "#D97706",
  bad: "#DC2626",
  // Стеклянные поверхности (используются через классы .glass* в глобальном CSS).
  glass: "rgba(255,255,255,0.58)",
  glassStrong: "rgba(255,251,246,0.80)",
  glassBorder: "rgba(255,255,255,0.65)",
  glassShadow: "0 8px 32px rgba(74,38,22,0.10), 0 2px 8px rgba(74,38,22,0.06)",
  // Фирменный градиент для основных кнопок и акцентов.
  brandGrad: "linear-gradient(135deg, #8A3323 0%, #7B2D1F 55%, #5E2016 100%)",
};

// 5 фаз жизненного цикла заявки — каждая со своим цветом
export const PHASES = [
  { n: 1, label: "Отправлено", color: "#2563EB", soft: "#EFF4FF" },
  { n: 2, label: "Просмотрено", color: "#7C3AED", soft: "#F5F0FE" },
  { n: 3, label: "В работе", color: "#EA580C", soft: "#FFF2E8" },
  { n: 4, label: "На проверке", color: "#DB2777", soft: "#FCEEF5" },
  { n: 5, label: "Завершено", color: "#16A34A", soft: "#E9F9EF" },
];
