"use client";

import { useEffect, useState } from "react";

export default function InstallButton() {
  const [prompt, setPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  };

  if (!prompt) return null;

  return (
    <button
      onClick={install}
      className="px-4 py-2 rounded-lg bg-indigo-600 text-white shadow"
    >
      Install Finora 📲
    </button>
  );
}