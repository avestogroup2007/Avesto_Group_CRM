import React from "react";

// Логотип Avesto — воссоздан как SVG в фирменных цветах:
// кремово-золотой фон и бордовый «слоёный» знак (цилиндр/торт).
// size — сторона квадратной плашки в пикселях.
const MAROON = "#7B2D1F";
const CREAM = "#F0CE86";

export default function Logo({ size = 40, radius = 10, style }) {
  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: CREAM, borderRadius: radius, ...style }}
    >
      <svg
        width={size * 0.72}
        height={size * 0.72}
        viewBox="0 0 48 48"
        fill="none"
        aria-label="Avesto"
      >
        {/* верхний ободок цилиндра */}
        <ellipse cx="24" cy="13" rx="13" ry="3.4" stroke={MAROON} strokeWidth="2.1" />
        {/* левый столбец слоёв (бордовые ряды 1 и 3) */}
        <rect x="11" y="14.5" width="13" height="4.8" fill={MAROON} />
        <rect x="11" y="24.1" width="13" height="4.8" fill={MAROON} />
        {/* правый столбец слоёв (бордовые ряды 2 и 4) — двухтоновый сдвиг */}
        <rect x="24" y="19.3" width="13" height="4.8" fill={MAROON} />
        <rect x="24" y="28.9" width="13" height="4.8" fill={MAROON} />
        {/* боковые стенки цилиндра */}
        <path
          d="M11 13 V33 Q11 35.6 13.6 36 H34.4 Q37 35.6 37 33 V13"
          stroke={MAROON}
          strokeWidth="2.1"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
