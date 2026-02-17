// lib/smart-alerts.ts

export type Tx = {
  id?: string;
  amount: number;
  type?: "income" | "expense";
  category?: string | null;
  date?: string | Date;
};

export type SmartAlert = {
  id: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "danger";
  createdAt: string;

  /** Optional UI helpers used by app/alerts/page.tsx */
  emoji?: string;
  detail?: string;
};

export function computeSmartAlerts(
  txs: Tx[] = [],
  selectedMonthDate?: Date | string | null,
  currency: string = ""
): SmartAlert[] {
  if (!txs.length) return [];

  // Optional: filter by month if provided
  let filtered = txs;

  if (selectedMonthDate) {
    const d = typeof selectedMonthDate === "string" ? new Date(selectedMonthDate) : selectedMonthDate;
    const y = d.getFullYear();
    const m = d.getMonth();

    filtered = txs.filter((t) => {
      const td =
        typeof t.date === "string" ? new Date(t.date) : t.date instanceof Date ? t.date : null;
      if (!td) return true; // if no date, keep it
      return td.getFullYear() === y && td.getMonth() === m;
    });
  }

  const totalExpense = filtered
    .filter((t) => (t.type ?? "expense") === "expense")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalIncome = filtered
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const alerts: SmartAlert[] = [];

  // Info summary
  alerts.push({
    id: "summary",
    title: "Monthly summary",
    message: `Income: ${currency}${totalIncome.toLocaleString()} • Expenses: ${currency}${totalExpense.toLocaleString()}`,
    severity: "info",
    createdAt: new Date().toISOString(),
    emoji: "📊",
    detail: selectedMonthDate ? "Summary for the selected month." : "Summary for your transactions.",
  });

  // Simple warning rule
  if (totalExpense > totalIncome && totalIncome > 0) {
    alerts.push({
      id: "overspend",
      title: "Spending is higher than income",
      message: "You spent more than you earned this month.",
      severity: "warning",
      createdAt: new Date().toISOString(),
      emoji: "⚠️",
      detail: "Consider setting a budget or trimming non-essentials.",
    });
  }

  // Optional: no-income insight
  if (totalIncome === 0 && totalExpense > 0) {
    alerts.push({
      id: "no-income",
      title: "No income recorded",
      message: "You have expenses but no income logged for this period.",
      severity: "warning",
      createdAt: new Date().toISOString(),
      emoji: "🧾",
      detail: "If this is wrong, add income transactions.",
    });
  }

  return alerts;
}
