"use client";

import { useEffect } from "react";

type ThemePref = "system" | "dark" | "light";

function applyTheme(pref: ThemePref) {
  const root = document.documentElement;

  let theme: "dark" | "light" = "dark";
  if (pref === "light") theme = "light";
  if (pref === "dark") theme = "dark";
  if (pref === "system") {
    theme = window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  root.setAttribute("data-theme", theme);
}

export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    // read saved pref
    const pref = (localStorage.getItem("themePref") as ThemePref) || "system";
    applyTheme(pref);

    // keep in sync with OS changes if user chose "system"
    const mql = window.matchMedia?.("(prefers-color-scheme: light)");
    const onChange = () => {
      const currentPref = (localStorage.getItem("themePref") as ThemePref) || "system";
      if (currentPref === "system") applyTheme("system");
    };

    mql?.addEventListener?.("change", onChange);
    return () => mql?.removeEventListener?.("change", onChange);
  }, []);

  return (
    <main className="authPage">
      <section className="glass authCard">
        <header className="authHeader">
          <h1 className="authTitle">{title}</h1>
          {subtitle ? <p className="authSubtitle">{subtitle}</p> : null}
        </header>

        <div className="authBody">{children}</div>
      </section>
    </main>
  );
}
