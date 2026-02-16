// lib/financialHealth.ts
// Financial Health Score: 0–100
// Designed to be imported by dashboard (UI should not contain the scoring logic).

export type MonthlyFinance = {
  month: string; // e.g. "2026-02" (YYYY-MM) or any label you use consistently
  income: number; // total income for the month
  expenses: number; // total expenses for the month
  savings?: number; // optional: if you track explicitly (otherwise derived)
  // Optional: if you already categorize spending, pass discretionary to improve insights
  discretionarySpending?: number;
};

export type FinancialHealthBreakdown = {
  incomeVsExpenses: number; // 0–100
  savingsRate: number; // 0–100
  spendingConsistency: number; // 0–100
  volatility: number; // 0–100
  emergencyBuffer: number; // 0–100
};

export type FinancialHealthResult = {
  score: number; // 0–100
  deltaFromPreviousMonth: number | null; // score difference vs previous
  breakdown: FinancialHealthBreakdown;
  signals: {
    expenseRatio: number; // expenses / income
    savingsRate: number; // savings / income
    estimatedSavings: number; // derived if not provided
    bufferMonths: number; // emergency fund months (if provided through options)
    volatilityIndex: number; // 0..1, higher = more volatile
    consistencyIndex: number; // 0..1, higher = more consistent
  };
  insight: {
    headline: string; // short dashboard text
    summary: string; // fuller explanation (AI-ready)
    strengths: string[];
    improvements: string[];
  };
};

export type FinancialHealthOptions = {
  // Used for emergency buffer scoring (if you track emergency savings elsewhere)
  emergencyFundAmount?: number; // total emergency fund balance
  // Control how many months to consider for consistency/volatility
  lookbackMonths?: number; // default 6
};

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

/**
 * Smooth scoring curve helper:
 * - If value <= good, returns 100
 * - If value >= bad, returns 0
 * - Linear between
 */
function scoreLowerIsBetter(value: number, good: number, bad: number) {
  if (!isFinite(value)) return 0;
  if (value <= good) return 100;
  if (value >= bad) return 0;
  const t = (bad - value) / (bad - good);
  return clamp(Math.round(t * 100));
}

/**
 * Smooth scoring curve helper:
 * - If value >= good, returns 100
 * - If value <= bad, returns 0
 * - Linear between
 */
function scoreHigherIsBetter(value: number, bad: number, good: number) {
  if (!isFinite(value)) return 0;
  if (value >= good) return 100;
  if (value <= bad) return 0;
  const t = (value - bad) / (good - bad);
  return clamp(Math.round(t * 100));
}

function mean(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdDev(nums: number[]) {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const v = mean(nums.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

/**
 * Coefficient of variation: std / mean
 * Normalized measure of volatility.
 */
function coeffVar(nums: number[]) {
  const m = mean(nums);
  if (m === 0) return 0;
  return stdDev(nums) / Math.abs(m);
}

function safeDiv(a: number, b: number) {
  if (!isFinite(a) || !isFinite(b) || b === 0) return 0;
  return a / b;
}

/**
 * Core scoring for a single month, using lookback for stability measures.
 */
function computeForMonth(
  current: MonthlyFinance,
  history: MonthlyFinance[],
  options: FinancialHealthOptions
): Omit<FinancialHealthResult, "deltaFromPreviousMonth"> {
  const lookback = options.lookbackMonths ?? 6;

  const income = Math.max(0, current.income || 0);
  const expenses = Math.max(0, current.expenses || 0);

  // Savings: prefer explicit savings, else derive = income - expenses (floored at 0)
  const derivedSavings = Math.max(0, income - expenses);
  const savings = Math.max(0, current.savings ?? derivedSavings);

  const expenseRatio = safeDiv(expenses, income); // 0..∞
  const savingsRate = safeDiv(savings, income); // 0..1

  // 1) Income vs Expenses score (30%): lower expenseRatio is better
  // Benchmarks: <= 0.70 excellent, >= 1.00 bad (spending all/over income)
  const incomeVsExpensesScore = scoreLowerIsBetter(expenseRatio, 0.7, 1.0);

  // 2) Savings rate score (25%): higher savingsRate better
  // Benchmarks: <= 0.05 bad, >= 0.20 excellent
  const savingsScore = scoreHigherIsBetter(savingsRate, 0.05, 0.2);

  // Lookback slice including current month if present in history
  const sorted = [...history].sort((a, b) => (a.month > b.month ? 1 : -1));
  const recent = sorted.slice(Math.max(0, sorted.length - lookback));

  const recentIncomes = recent.map((m) => Math.max(0, m.income || 0));
  const recentExpenses = recent.map((m) => Math.max(0, m.expenses || 0));

  // 3) Spending consistency (20%): lower expense variability is better
  // Use coefficient of variation on expenses
  const expenseCV = coeffVar(recentExpenses); // 0..∞
  // Convert CV to a 0..100 score.
  // CV <= 0.10 = very consistent => 100
  // CV >= 0.50 = chaotic => 0
  const spendingConsistencyScore = scoreLowerIsBetter(expenseCV, 0.1, 0.5);

  // 4) Volatility (15%): combined income and expense volatility
  const incomeCV = coeffVar(recentIncomes);
  const combinedVol = 0.5 * incomeCV + 0.5 * expenseCV; // simple blend
  // CV <= 0.10 excellent, >= 0.60 poor
  const volatilityScore = scoreLowerIsBetter(combinedVol, 0.1, 0.6);

  // 5) Emergency buffer (10%): months of expenses covered
  const emergencyFund = Math.max(0, options.emergencyFundAmount ?? 0);
  const bufferMonths = expenses > 0 ? emergencyFund / expenses : emergencyFund > 0 ? 6 : 0;
  // >= 3 months excellent, <= 0.5 months poor
  const emergencyBufferScore = scoreHigherIsBetter(bufferMonths, 0.5, 3.0);

  const breakdown: FinancialHealthBreakdown = {
    incomeVsExpenses: incomeVsExpensesScore,
    savingsRate: savingsScore,
    spendingConsistency: spendingConsistencyScore,
    volatility: volatilityScore,
    emergencyBuffer: emergencyBufferScore,
  };

  // Weighted final score
  const scoreRaw =
    breakdown.incomeVsExpenses * 0.30 +
    breakdown.savingsRate * 0.25 +
    breakdown.spendingConsistency * 0.20 +
    breakdown.volatility * 0.15 +
    breakdown.emergencyBuffer * 0.10;

  const score = clamp(Math.round(scoreRaw));

  // Insights (simple, rule-based; your AI route can rewrite this nicer later)
  const strengths: string[] = [];
  const improvements: string[] = [];

  if (breakdown.incomeVsExpenses >= 75) strengths.push("Good income vs expenses balance");
  else improvements.push("Reduce expenses relative to income");

  if (breakdown.savingsRate >= 75) strengths.push("Strong savings rate");
  else improvements.push("Boost savings rate (even +5% helps)");

  if (breakdown.spendingConsistency >= 75) strengths.push("Consistent spending pattern");
  else improvements.push("Smooth out spending spikes month-to-month");

  if (breakdown.volatility >= 75) strengths.push("Stable financial flow");
  else improvements.push("Lower volatility (avoid large swings where possible)");

  if (breakdown.emergencyBuffer >= 75) strengths.push("Healthy emergency buffer");
  else improvements.push("Build an emergency buffer (aim for 3 months)");

  // Optional discretionary hint
  const discretionary = Math.max(0, current.discretionarySpending ?? 0);
  if (discretionary > 0 && income > 0) {
    const discRate = discretionary / income;
    if (discRate > 0.25) improvements.push("High discretionary spend is dragging your score");
  }

  const headline =
    score >= 85
      ? "Elite money discipline. Keep this up."
      : score >= 70
      ? "Solid financial health — a few tweaks can push you higher."
      : score >= 50
      ? "Fair, but you’ve got some leaks to fix."
      : "Your finances are under pressure — let’s stabilise first.";

  const summaryParts: string[] = [];
  summaryParts.push(`Score ${score}/100.`);
  if (income > 0) {
    summaryParts.push(
      `You spent ${(expenseRatio * 100).toFixed(0)}% of your income and saved ${(savingsRate * 100).toFixed(0)}%.`
    );
  } else {
    summaryParts.push("Income for this month is low or missing, so the score leans conservative.");
  }
  if ((options.emergencyFundAmount ?? 0) > 0) {
    summaryParts.push(`Your emergency buffer is about ${bufferMonths.toFixed(1)} months.`);
  }

  const insight = {
    headline,
    summary: summaryParts.join(" "),
    strengths,
    improvements,
  };

  return {
    score,
    breakdown,
    signals: {
      expenseRatio,
      savingsRate,
      estimatedSavings: savings,
      bufferMonths,
      volatilityIndex: clamp(Math.round(combinedVol * 100), 0, 100) / 100, // 0..1-ish
      consistencyIndex: clamp(Math.round((1 - expenseCV) * 100), 0, 100) / 100, // 0..1-ish
    },
    insight,
  };
}

/**
 * Public API
 * Provide at least 2 months to compute delta; if only 1 month, delta is null.
 */
export function calculateFinancialHealth(
  months: MonthlyFinance[],
  options: FinancialHealthOptions = {}
): FinancialHealthResult | null {
  if (!months || months.length === 0) return null;

  const sorted = [...months].sort((a, b) => (a.month > b.month ? 1 : -1));
  const current = sorted[sorted.length - 1];
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

  const currentRes = computeForMonth(current, sorted, options);

  let delta: number | null = null;
  if (prev) {
    const prevRes = computeForMonth(prev, sorted.slice(0, sorted.length - 1), options);
    delta = clamp(currentRes.score - prevRes.score, -100, 100);
  }

  return {
    ...currentRes,
    deltaFromPreviousMonth: delta,
  };
}
