// lib/haptics.ts
// Safe haptics helper (Android/Chromium supports navigator.vibrate; iOS mostly ignores)

type Pattern = number | number[];

function vibrate(pattern: Pattern) {
  if (typeof window === "undefined") return;
  const nav = window.navigator as any;
  if (typeof nav?.vibrate === "function") nav.vibrate(pattern);
}

export const haptics = {
  light: () => vibrate(10),
  medium: () => vibrate(25),
  heavy: () => vibrate([30, 20, 30]),
  custom: (pattern: Pattern) => vibrate(pattern),
};
