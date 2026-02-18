import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Parse money-ish inputs like:
 * - "TZS 1,000,000.00"
 * - "1 000 000"
 * - "(1,234.50)"
 * - "-1234.5"
 * Returns NaN if it can't parse.
 */
function parseMoney(v: unknown): number {
  if (typeof v === "number") return v;

  if (typeof v === "string") {
    let s = v.trim();

    // Handle (123.45) as negative
    const isParenNeg = /^\(.*\)$/.test(s);
    if (isParenNeg) s = s.slice(1, -1);

    // Remove currency letters/symbols and keep digits, dot, comma, minus, space
    // e.g. "TZS 1,000,000.00" -> " 1,000,000.00"
    s = s.replace(/[^\d.,\-\s]/g, "");

    // Remove spaces
    s = s.replace(/\s+/g, "");

    // If both comma and dot exist, assume comma is thousands separator
    // "1,234.56" -> "1234.56"
    if (s.includes(",") && s.includes(".")) {
      s = s.replace(/,/g, "");
    } else if (s.includes(",") && !s.includes(".")) {
      // "1234,56" -> "1234.56" (EU style)
      s = s.replace(/,/g, ".");
    }

    const n = Number.parseFloat(s);
    if (!Number.isFinite(n)) return Number.NaN;
    return isParenNeg ? -n : n;
  }

  return Number.NaN;
}

/**
 * Lenient numeric coercion:
 * - accepts numbers
 * - accepts strings like "TZS 1,000,000.00"
 * - accepts objects like { value }, { amount }, { total }, { text }
 */
function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;

  if (typeof v === "object" && v !== null) {
    const anyV = v as Record<string, unknown>;
    const candidate =
      anyV.value ??
      anyV.amount ??
      anyV.total ??
      anyV.sum ??
      anyV.number ??
      (typeof anyV.text === "string" ? anyV.text : undefined);

    if (candidate !== undefined) return toNumber(candidate);
  }

  const n = parseMoney(v);
  return Number.isFinite(n) ? n : null;
}

function pickFirst<T>(...vals: T[]): T | undefined {
  for (const v of vals) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function monthFallback(): string {
  const d = new Date();
  const month = d.toLocaleString("en-GB", { month: "long" });
  const year = d.getFullYear();
  return `${month} ${year}`;
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  try {
    const body = await req.json().catch(() => ({}));

    const month =
      typeof pickFirst(body?.month, body?.monthLabel, body?.period, body?.label) === "string"
        ? (pickFirst(body?.month, body?.monthLabel, body?.period, body?.label) as string)
        : monthFallback();

    const incomeNum =
      toNumber(
        pickFirst(
          body?.income,
          body?.incomeNum,
          body?.income_value,
          body?.totalIncome,
          body?.incomeThisMonth,
          body?.incomeText
        )
      ) ?? null;

    const expensesNum =
      toNumber(
        pickFirst(
          body?.expenses,
          body?.expense,
          body?.expensesNum,
          body?.expenses_value,
          body?.totalExpenses,
          body?.expensesThisMonth,
          body?.expenseText
        )
      ) ?? null;

    let balanceNum =
      toNumber(
        pickFirst(
          body?.balance,
          body?.bal,
          body?.net,
          body?.netBalance,
          body?.balanceThisMonth,
          body?.balanceText
        )
      ) ?? null;

    if (balanceNum === null && incomeNum !== null && expensesNum !== null) {
      balanceNum = incomeNum - expensesNum;
    }

    if (!month || incomeNum === null || expensesNum === null || balanceNum === null) {
      const missing: string[] = [];
      if (!month) missing.push("month/monthLabel/period/label");
      if (incomeNum === null) missing.push("income/incomeNum/totalIncome/incomeText");
      if (expensesNum === null) missing.push("expenses/expensesNum/totalExpenses/expenseText");
      if (balanceNum === null) missing.push("balance/bal/net/balanceText");

      console.warn("[/api/ai/summary] Bad request - missing/invalid fields:", { missing, body });

      return NextResponse.json(
        { ok: false, error: "BAD_REQUEST", missing, received: body ?? null, requestId },
        { status: 400 }
      );
    }

    const rawKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
    const apiKey = rawKey.trim();

    // TEMP DEBUG: helps confirm Vercel is injecting the expected key (does NOT log the full key)
    console.log("[ai] key_check", {
      present: !!apiKey,
      rawLen: rawKey.length,
      trimmedLen: apiKey.length,
      startsWithQuote: rawKey.startsWith('"') || rawKey.startsWith("'"),
      endsWithQuote: rawKey.endsWith('"') || rawKey.endsWith("'"),
      end4: apiKey.slice(-4),
      hadWhitespace: rawKey.length !== apiKey.length,
    });

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "MISSING_API_KEY", message: "Set GEMINI_API_KEY (server env) in Vercel." },
        { status: 500 }
      );
    }

    // Safe diagnostics (does not log the key itself)
    if (rawKey && rawKey !== apiKey) {
      console.warn("[ai.summary] GEMINI_API_KEY had surrounding whitespace; trimmed.", { requestId, rawLen: rawKey.length, trimmedLen: apiKey.length });
    }
    if (rawKey.startsWith('"') || rawKey.startsWith("\'") || rawKey.endsWith('"') || rawKey.endsWith("\'")) {
      console.warn("[ai.summary] GEMINI_API_KEY looks quoted in env; remove quotes in Vercel.", { requestId });
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

    const prompt = `
You are a helpful assistant for a personal finance app.

Use ONLY the figures provided below. Do NOT assume missing transactions or set values to zero.

Month: ${month}
Income (TZS): ${incomeNum}
Expenses (TZS): ${expensesNum}
Balance (TZS): ${balanceNum}

Give:
1) 1-sentence sentiment check
2) 3 actionable tips
3) 1 quick smart alert if something is unusually high
`;

    const result = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text =
      ((result as any)?.text as string | undefined)?.trim() ||
      result?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("").trim() ||
      "";

    return NextResponse.json({ ok: true, text, model, requestId }, { status: 200 });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 500;
    const details = err?.error ?? null;
    console.error("[/api/ai/summary] Error:", {
      requestId,
      message: err?.message ?? String(err),
      status: err?.status,
      error: details,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "AI_ERROR",
        message: err?.message ?? "Unknown error",
        requestId,
        details,
      },
      { status }
    );
  }
}
