import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

type MonthlyData = {
  period?: string;
  currency?: string;
  income?: number | string;
  expenses?: number | string;
  balance?: number | string;
  topCategories?: any;
  savingsGoals?: any;
  recentTransactions?: any;
};

export async function POST(req: Request) {
  try {
    // Optional: if you’re using auth, read userId here
    // Example (NextAuth): const session = await getServerSession(authOptions)
    // const userId = session?.user?.id

    const body = await req.json().catch(() => null);
    const data: MonthlyData | undefined = body?.data;

    if (!data) {
      return NextResponse.json(
        { text: "Missing 'data' in request body." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { text: "API Key not configured." },
        { status: 500 }
      );
    }

    // ✅ If your /api/ai/summary route already rate-limits, the frontend should call that.
    // If THIS route is the one being called, you should also apply the same limiter here.
    // If you paste your limiter helper, I’ll wire it in directly.

    const genAI = new GoogleGenerativeAI(apiKey);

    // NOTE: Newer Gemini models may use different names; keep yours if it’s working.
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
Act as a friendly financial advisor. Analyze this monthly data:
Period: ${data.period ?? "N/A"} | Currency: ${data.currency ?? "N/A"}
Income: ${data.income ?? "N/A"} | Expenses: ${data.expenses ?? "N/A"} | Balance: ${
      data.balance ?? "N/A"
    }
Top Categories: ${safeJson(data.topCategories)}
Savings Goals: ${safeJson(data.savingsGoals)}
Recent Txns: ${safeJson(data.recentTransactions)}

Provide:
1) A 1-sentence sentiment check.
2) 3 specific, actionable tips.
3) A quick alert if any category is unusually high.
Keep it concise and practical.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ text }, { status: 200 });
  } catch (error: any) {
    const message =
      typeof error?.message === "string" ? error.message : "Unknown error";
    return NextResponse.json({ text: "Error: " + message }, { status: 500 });
  }
}

function safeJson(value: any) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return '"[unserializable]"';
  }
}
