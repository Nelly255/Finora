// lib/theme.ts
export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "finora-theme";

export function getStoredTheme(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  const t = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  if (t === "light" || t === "dark" || t === "system") return t;
  return null;
}

export function storeTheme(mode: ThemeMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, mode);
}

export function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;

  const resolved = mode === "system" ? getSystemTheme() : mode;

  // Use either data-theme or class strategy — this supports both.
  document.documentElement.dataset.theme = resolved;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}
