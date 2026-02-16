"use client";

import { useEffect, useMemo, useState } from "react";
import { ThemeMode, applyTheme, getStoredTheme, getSystemTheme, storeTheme } from "./theme";

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>("system");

  // initial load
  useEffect(() => {
    const t = getStoredTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  // apply on change
  useEffect(() => {
    applyTheme(theme);
    storeTheme(theme);
  }, [theme]);

  // if theme is system, react to OS change live
  useEffect(() => {
    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");

    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [theme]);

  const effective = useMemo(() => {
    return theme === "system" ? getSystemTheme() : theme;
  }, [theme]);

  return { theme, effective, setTheme };
}
