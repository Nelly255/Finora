"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Currency = "TZS" | "USD";
type TxnType = "expense" | "income";

type Txn = {
  id: string;
  type: TxnType;
  amount: number;
  note: string | null;
  date: string; // YYYY-MM-DD
  category_name?: string | null;
};

function formatMoney(amount: number, currency: Currency) {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const parts = abs.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${currency} ${parts.join(".")}`;
}

export default function TransactionsPage() {
  const router = useRouter();

  const [currency] = useState<Currency>("TZS");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [search, setSearch] = useState("");
  const [txns, setTxns] = useState<Txn[]>([]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError("");

      const { data: sessionRes, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) {
        setError(sessionErr.message);
        setLoading(false);
        return;
      }
      if (!sessionRes.session?.user) {
        router.replace("/login");
        return;
      }

      const res = await supabase
        .from("transactions")
        .select("id,type,amount,note,date,category:categories(name)")
        .order("date", { ascending: false })
        .limit(500);

      if (res.error) {
        setError(res.error.message);
        setTxns([]);
      } else {
        const mapped = (res.data ?? []).map((t: any) => ({
          id: t.id,
          type: t.type,
          amount: Number(t.amount),
          note: t.note,
          date: t.date,
          category_name: t.category?.name ?? null,
        })) as Txn[];
        setTxns(mapped);
      }

      setLoading(false);
    };

    run();
  }, [router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return txns;

    return txns.filter((t) => {
      const cat = (t.category_name ?? "").toLowerCase();
      const note = (t.note ?? "").toLowerCase();
      const type = t.type.toLowerCase();
      const amt = String(t.amount);
      const date = t.date.toLowerCase();
      return (
        cat.includes(q) ||
        note.includes(q) ||
        type.includes(q) ||
        amt.includes(q) ||
        date.includes(q)
      );
    });
  }, [txns, search]);

  return (
    <div style={{ padding: 18, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Transactions</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>
            Showing {filtered.length} of {txns.length} (latest 500)
          </p>
        </div>

        <Link href="/dashboard" className="btn btn-ghost" style={{ padding: "10px 12px", borderRadius: 10 }}>
          ← Back to dashboard
        </Link>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by note, category, amount, date..."
            className="input"
            style={{ minWidth: 260, flex: 1 }}
          />
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            Tip: try "rent", "income", or a date like "2026-02"
          </span>
        </div>

        {loading ? (
          <div style={{ color: "var(--muted)" }}>Loading…</div>
        ) : error ? (
          <div style={{ color: "tomato" }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>No transactions found.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map((t) => {
              const isExpense = t.type === "expense";
              const signedAmount = isExpense ? -Math.abs(t.amount) : Math.abs(t.amount);

              return (
                <div
                  key={t.id}
                  className="row"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: 12,
                    borderRadius: 12,
                    background: "var(--card2)",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 14 }}>
                        {t.category_name ?? (isExpense ? "Expense" : "Income")}
                      </strong>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{t.date}</span>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>
                        {isExpense ? "Expense" : "Income"}
                      </span>
                    </div>
                    {t.note ? (
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>{t.note}</div>
                    ) : null}
                  </div>

                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {formatMoney(signedAmount, currency)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
