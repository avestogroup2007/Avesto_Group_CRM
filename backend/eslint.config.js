// Конфигурация ESLint (flat config, ESLint 9).
import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "prisma/migrations/**"],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        fetch: "readonly",
      },
    },
    rules: {
      // Разрешаем неиспользуемые аргументы с префиксом _ (напр. next в обработчике ошибок).
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
