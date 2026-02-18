import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

const DAILY_AI_LIMIT = 5;

function getClientId(req: Request, bodyUserId?: string) {
  if (bodyUserId && bodyUserId.trim()) return `uid:${bodyUserId.trim()}`;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `ip:${ip}`;
}

function secondsUntilUtcMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.floor((next.getTime() - now.getTime()) / 1000));
}

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

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "MISSING_API_KEY", message: "Set GEMINI_API_KEY (server env) in Vercel." },
        { status: 500 }
      );
    }

// Server-side daily limit (requires Upstash Redis env vars).
// Limits by authenticated userId when provided, otherwise falls back to IP.
if (redis) {
  const bodyUserId = typeof body?.userId === "string" ? body.userId : undefined;
  const clientId = getClientId(req, bodyUserId);
  const day = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const key = `ai:summary:${clientId}:${day}`;
  const ttl = secondsUntilUtcMidnight();

  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, ttl);

  const remaining = Math.max(0, DAILY_AI_LIMIT - count);

  if (count > DAILY_AI_LIMIT) {
    return NextResponse.json(
      {
        ok: false,
        error: "DAILY_LIMIT_REACHED",
        code: "DAILY_LIMIT_REACHED",
        message: `You’ve hit your ${DAILY_AI_LIMIT} AI insights for today. Come back tomorrow 🙂`,
        limit: DAILY_AI_LIMIT,
        remaining: 0,
        resetInSeconds: ttl,
        resetAtUtc: new Date(Date.now() + ttl * 1000).toISOString(),
        requestId,
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(ttl),
        },
      }
    );
  }

  // Attach remaining to the request object via (body as any) for later success response.
  (body as any).__aiRemaining = remaining;
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

    const remaining = typeof (body as any).__aiRemaining === "number" ? (body as any).__aiRemaining : undefined;

    return NextResponse.json(
      { ok: true, summary: text, text, model, requestId, limit: DAILY_AI_LIMIT, remaining },
      { status: 200 }
    );
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
