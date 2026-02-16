"use client";

import * as React from "react";

type ChatMsg = { role: "user" | "assistant"; content: string };

export default function FollowUpChat({
  context,
  storageKey = "ai_followup_thread_v1",
}: {
  context?: any; // pass your dashboard numbers/totals here
  storageKey?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [thread, setThread] = React.useState<ChatMsg[]>([]);

  // Load thread from localStorage
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setThread(JSON.parse(raw));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist thread
  React.useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(thread));
    } catch {}
  }, [thread, storageKey]);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;

    const nextThread: ChatMsg[] = [...thread, { role: "user", content: q }];
    setThread(nextThread);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          context: context ?? null,
          history: nextThread.slice(-6), // keep it light
        }),
      });

      // Be defensive: provider might return non-JSON on edge errors
      let data: any = null;
      const rawText = await res.text().catch(() => "");
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = null;
      }

      // New API shape: { ok: true, text } OR { ok: false, error, code }
      if (!res.ok || (data && data.ok === false)) {
        const msg =
          data?.error ||
          (res.status === 429
            ? "AI limit reached right now. Try again in a minute."
            : "Failed to get response");
        throw new Error(msg);
      }

      const answerText = String(data?.text ?? data?.answer ?? "").trim() || "No response";
      setThread((prev) => [...prev, { role: "assistant", content: answerText }]);
    } catch (e: any) {
      setThread((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry mate — I hit an error: ${e?.message || "unknown"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    setThread([]);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-medium underline underline-offset-4 hover:opacity-80"
      >
        {open ? "Hide follow-up" : "Ask a follow-up"}
      </button>

      {open && (
        <div className="mt-3 rounded-2xl border bg-white/60 backdrop-blur p-3 shadow-sm">
          {/* Quick prompts */}
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              "How can I reduce expenses next month?",
              "What if income drops by 20%?",
              "Is this spending pattern risky?",
            ].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setInput(t)}
                className="text-xs px-3 py-1 rounded-full border bg-white hover:opacity-80"
              >
                {t}
              </button>
            ))}
          </div>

          {/* Thread */}
          {thread.length > 0 && (
            <div className="max-h-64 overflow-auto space-y-2 pr-1">
              {thread.map((m, i) => (
                <div
                  key={i}
                  className={[
                    "text-sm rounded-2xl px-3 py-2 whitespace-pre-wrap",
                    m.role === "user"
                      ? "ml-auto bg-black text-white max-w-[85%]"
                      : "mr-auto bg-white border max-w-[85%]",
                  ].join(" ")}
                >
                  {m.content}
                </div>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="mt-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask anything about your numbers…"
              className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
              disabled={loading}
            />

            <button
              type="button"
              onClick={send}
              disabled={loading || !input.trim()}
              className="rounded-xl border px-4 py-2 text-sm font-medium bg-white hover:opacity-80 disabled:opacity-50"
            >
              {loading ? "Thinking…" : "Send"}
            </button>
          </div>

          {/* Tools */}
          <div className="mt-2 flex justify-between">
            <span className="text-xs opacity-70">
              Tip: hit Enter to send.
            </span>
            <button
              type="button"
              onClick={clearChat}
              className="text-xs underline underline-offset-4 hover:opacity-80"
            >
              Clear chat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
