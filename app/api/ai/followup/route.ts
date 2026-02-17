import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// Ensure this route runs on the Node.js runtime (not Edge),
// since most AI SDKs expect Node APIs.
export const runtime = "nodejs";

type ChatMsg = { role: "user" | "assistant"; content: string };

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function pickLastTurns(history: ChatMsg[], maxTurns = 6): ChatMsg[] {
  if (!Array.isArray(history)) return [];
  return history.filter(Boolean).slice(-maxTurns);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const question = typeof body?.question === "string" ? body.question.trim() : "";
    const context = body?.context ?? null;
    const history = pickLastTurns(body?.history ?? [], 6);

    const modeRaw = typeof body?.mode === "string" ? body.mode.trim().toLowerCase() : "";
    const mode =
      modeRaw === "risk" ? "risk" :
      (modeRaw === "what-if" || modeRaw === "whatif" || modeRaw === "what_if") ? "what-if" :
      modeRaw === "advice" ? "advice" : "advice";

    const modeGuidance =
      mode === "risk"
        ? "Focus on risks, red flags, volatility, and what could go wrong. Include mitigations. Use clear severity labels (Low/Med/High) when relevant."
        : mode === "what-if"
        ? "Treat the question as a scenario simulation. State assumptions clearly, then show the impact and steps. If key numbers are missing, ask 1 short clarifying question OR give a best-effort outline without inventing figures."
        : "Give practical, step-by-step recommendations. Keep it actionable and concise.";

    if (!question) {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Missing GEMINI_API_KEY" }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Build a light conversation transcript for Gemini
    const transcript = history
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const prompt = `
You are a helpful finance assistant inside a personal expense tracker app.

Rules:
- Use ONLY the provided context for any numbers.
- Follow the requested mode strictly (advice | risk | what-if).
- If the user asks for calculations and the needed numbers aren't in context, ask 1 short clarifying question OR give best-effort advice without inventing numbers.
- Be concise and practical. Prefer bullets for suggestions.
- For "what-if" questions, outline assumptions clearly (e.g., income drops by 20%).
- Output plain text (no markdown tables).


Mode:
${mode}

Mode guidance:
${modeGuidance}


Context (JSON):
${safeJson(context)}

Conversation (recent):
${transcript || "(none)"}

User question:
${question}
`.trim();

    let result: any;
    try {
      result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status ?? e?.cause?.status;
      const msg = String(e?.message ?? e ?? "");
      const isQuota =
        status === 429 ||
        /429/.test(msg) ||
        /RESOURCE_EXHAUSTED/i.test(msg) ||
        /quota/i.test(msg) ||
        /rate/i.test(msg);

      if (isQuota) {
        return NextResponse.json(
          {
            ok: false,
            code: "QUOTA_EXCEEDED",
            error:
              "AI limit reached right now. Try again in a minute (or increase your Gemini quota).",
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        {
          ok: false,
          code: "AI_PROVIDER_ERROR",
          error: "AI service error. Please try again.",
          debug: process.env.NODE_ENV === "development" ? msg.slice(0, 400) : undefined,
        },
        { status: typeof status === "number" ? status : 502 }
      );
    }

    const textOut =
      (result?.candidates?.[0]?.content?.parts ?? [])
        .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
        .join("")
        .trim() ||
      "No response";

    return NextResponse.json({
      ok: true,
      text: textOut,
      debug:
      process.env.NODE_ENV === "development"
        ? { questionLength: question.length, historyTurns: history.length }
        : undefined,
    });

  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        code: "SERVER_ERROR",
        error: "Server error. Please try again.",
        debug:
          process.env.NODE_ENV === "development"
            ? String(err?.message ?? err).slice(0, 400)
            : undefined,
      },
      { status: 500 }
    );
  }
}

