"use client";

import { haptics } from "@/lib/haptics";

export default function HeaderActions({
  onOpenAi,
  onLogout,
}: {
  onOpenAi: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="ai-btn"
        onClick={() => {
          haptics.light();
          onOpenAi();
        }}
      >
        ✨ AI
      </button>

      <button
        type="button"
        className="logout-btn"
        onClick={() => {
          haptics.medium();
          onLogout();
        }}
      >
        Log out
      </button>
    </div>
  );
}
