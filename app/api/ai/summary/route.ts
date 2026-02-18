import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

/**
 * Lenient numeric coercion:
 * - accepts numbers
 * - accepts strings like "TZS 1,000,000.00"
 */
function toNumber(v: unknown): number | null {
  // Accept: number, numeric strings (with commas/currency), or common object shapes ({ value }, { amount }, { total })
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
  // Server-side fallback label like "February 2026"
  const d = new Date();
  const month = d.toLocaleString("en-GB", { month: "long" });
  const year = d.getFullYear();
  return `${month} ${year}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // Accept multiple possible field names from the frontend
    const month =
      typeof pickFirst(
        body?.month,
        body?.monthLabel,
        body?.period,
        body?.label
      ) === "string"
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

    // balance can be explicitly provided, or derived from income - expenses
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

    // If something is missing, return a helpful 400 with what we received.
  if (!month || incomeNum === null || expensesNum === null || balanceNum === null) {
    const missing: string[] = [];
    if (!month) missing.push("month/monthLabel/period/label");
    if (incomeNum === null) missing.push("income/incomeNum/totalIncome/incomeText");
    if (expensesNum === null) missing.push("expenses/expensesNum/totalExpenses/expenseText");
    if (balanceNum === null) missing.push("balance/bal/net/balanceText");

    console.warn("[/api/ai/summary] Bad request - missing/invalid fields:", { missing, body });

    return NextResponse.json(
      {
        ok: false,
        error: "BAD_REQUEST",
        missing,
        received: body ?? null,
      },
      { status: 400 }
    );
  }

const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Missing GEMINI_API_KEY" }, { status: 500 });
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

Return:
1) A 2–3 sentence summary
2) 2–4 bullet insights (use the numbers)
3) 1 practical next step
`.trim();

    let result: any;
    try {
      result = await ai.models.generateContent({
        model,
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
      result?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ||
      "No response";

    return NextResponse.json({
      ok: true,
      text: textOut,
      debug:
        process.env.NODE_ENV === "development"
          ? { month, income: incomeNum, expenses: expensesNum, balance: balanceNum }
          : undefined,
    });
} catch (err: any) {
    const message = err?.message ?? String(err);
    const status =
      err?.status ??
      err?.response?.status ??
      err?.cause?.status ??
      err?.cause?.response?.status;

    // Some Google SDK errors carry useful payloads on `response` or `errorDetails`
    const details =
      err?.response?.data ??
      err?.response?.body ??
      err?.errorDetails ??
      err?.cause?.response?.data ??
      err?.cause?.response?.body;

    console.error("[/api/ai/summary] AI request failed:", {
      message,
      status,
      details,
    });

    return NextResponse.json(
      {
        ok: false,
        code: "AI_ERROR",
        error: message,
        status,
        // keep details in prod too (trimmed) so you can diagnose in Vercel logs/UI
        details:
          details
            ? typeof details === "string"
              ? details.slice(0, 2000)
              : details
            : undefined,
      },
      { status: 500 }
    );
  }
}
