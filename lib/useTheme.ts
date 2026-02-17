"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ThemeMode,
  applyTheme,
  getStoredTheme,
  getSystemTheme,
  storeTheme,
} from "./theme";

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>("system");

  // Apply theme on mount
  useEffect(() => {
    const stored = getStoredTheme();
    const resolved: ThemeMode = stored ?? "system";

    setTheme(resolved);
    applyTheme(resolved);
  }, []);

  const effectiveTheme = useMemo(() => {
    return theme === "system" ? getSystemTheme() : theme;
  }, [theme]);

  const setAndApplyTheme = (mode: ThemeMode) => {
    setTheme(mode);
    storeTheme(mode);
    applyTheme(mode);
  };

  return {
    theme,
    effectiveTheme,
    setTheme: setAndApplyTheme,
  };
}
