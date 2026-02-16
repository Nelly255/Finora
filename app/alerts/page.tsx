"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { computeSmartAlerts, type Tx } from "@/lib/smart-alerts";

export default function AlertsPage() {
  const router = useRouter();

  // ✅ Replace this with your real transactions state / fetch
  const [transactions, setTransactions] = React.useState<Tx[]>([]);
  const [selectedMonthDate, setSelectedMonthDate] = React.useState<Date>(new Date());
  const [currency, setCurrency] = React.useState("TZS");

  const alerts = React.useMemo(
    () => computeSmartAlerts(transactions, selectedMonthDate, currency),
    [transactions, selectedMonthDate, currency]
  );

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Smart Alerts</h1>
            <p className="text-sm opacity-70">Quiet insights that flag what changed and why it matters.</p>
          </div>
          <button
            className="rounded-xl border px-3 py-2 text-sm hover:opacity-80"
            onClick={() => router.push("/dashboard")}
          >
            Back
          </button>
        </div>

        <div className="mt-5 rounded-2xl border bg-white/5 p-4">
          {alerts.length === 0 ? (
            <div className="text-sm opacity-70">No alerts right now — you’re looking good.</div>
          ) : (
            <div className="space-y-3">
              {alerts.map((a) => (
                <div key={a.id} className="rounded-2xl border bg-black/20 p-4">
                  <div className="text-sm font-medium">
                    <span className="mr-2">{a.emoji}</span>
                    {a.title}
                  </div>
                  {a.detail && <div className="mt-1 text-xs opacity-70">{a.detail}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 text-xs opacity-60">
          Tip: Alerts are calculated from your last 3 months + current month activity.
        </div>
      </div>
    </div>
  );
}
