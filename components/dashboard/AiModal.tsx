import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { data } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ text: "API Key not configured." }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
      Act as a friendly financial advisor. Analyze this monthly data:
      Period: ${data.period} | Currency: ${data.currency}
      Income: ${data.income} | Expenses: ${data.expenses} | Balance: ${data.balance}
      Top Categories: ${JSON.stringify(data.topCategories)}
      Savings Goals: ${JSON.stringify(data.savingsGoals)}
      Recent Txns: ${JSON.stringify(data.recentTransactions)}

      Provide:
      1. A 1-sentence sentiment check.
      2. 3 specific, actionable tips.
      3. A quick alert if any category is unusually high.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ text });
  } catch (error: any) {
    return NextResponse.json({ text: "Error: " + error.message }, { status: 500 });
  }
}