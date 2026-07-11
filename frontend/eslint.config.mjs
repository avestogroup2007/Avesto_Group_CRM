// ESLint фронтенда: главная задача — ловить обращения к несуществующим
// переменным (no-undef) при разбивке App.jsx на модули: сборка Vite такие
// ошибки не видит, они всплывают только в рантайме у пользователя.
// no-unused-vars намеренно выключен: базовый парсер не считает JSX-использование
// (<Icon />) за использование и даёт ложные срабатывания на импортах иконок.
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  {
    files: ["src/**/*.{js,jsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2024 },
    },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "no-undef": "error",
      // Правила хуков пока выключены: в коде остались точечные отключения
      // exhaustive-deps, включим после разбивки App.jsx на экраны.
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    files: ["vite.config.js", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node, ...globals.es2024 },
    },
    rules: { "no-undef": "error" },
  },
];
