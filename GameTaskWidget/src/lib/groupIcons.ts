/**
 * Базовый URL для иконок групп.
 * Файлы должны лежать в public/ico/ (при сборке копируются в dist/ico/).
 * base: './' в Vite нужен, чтобы в Tauri production пути работали.
 */
const BASE = typeof import.meta.env.BASE_URL === "string" && import.meta.env.BASE_URL
  ? import.meta.env.BASE_URL.replace(/\/?$/, "/")
  : "./";

export function getGroupIconUrl(iconPath: string): string {
  if (!iconPath) return "";
  const clean = iconPath.replace(/^\//, "");
  return `${BASE}ico/${clean}`;
}
