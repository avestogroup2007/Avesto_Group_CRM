import React from "react";
import logoUrl from "./assets/avesto-logo.png";

// Официальный логотип Avesto: кремовый знак-«торт» и бордовая плашка «avesto».
// Картинка уже обрезана по содержимому, поэтому показываем её как есть.
// size — высота логотипа в пикселях; ширина подстраивается по пропорции.
export default function Logo({ size = 40, radius = 8, style }) {
  return (
    <img
      src={logoUrl}
      alt="Avesto"
      className="shrink-0 block"
      style={{ height: size, width: "auto", borderRadius: radius, ...style }}
    />
  );
}
