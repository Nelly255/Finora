"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Asset = {
  id: string;
  name: string;
  category: string | null;
  purchase_date: string | null;
  cost: number;
  rate: number | null;
  nbv: number | null;
  accumulated_depreciation?: number | null;
  user_id?: string | null;
};

type ToastKind = "success" | "error" | "info";

function money(n: number) {
  try {
    return new Intl.NumberFormat("en-TZ", {
      style: "decimal",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return String(n);
  }
}

function Toast({
  text,
  kind = "info",
  onClose,
}: {
  text: string;
  kind?: ToastKind;
  onClose: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="card"
      style={{
        position: "fixed",
        right: 16,
        top: 16,
        zIndex: 60,
        padding: "12px 14px",
        borderRadius: 16,
        minWidth: 260,
        maxWidth: 360,
        boxShadow: "0 12px 30px rgba(0,0,0,.18)",
        border:
          kind === "success"
            ? "1px solid rgba(34,197,94,.35)"
            : kind === "error"
              ? "1px solid rgba(239,68,68,.35)"
              : "1px solid rgba(148,163,184,.35)",
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ fontWeight: 900, fontSize: 13, marginTop: 1 }}>
          {kind === "success" ? "✅" : kind === "error" ? "⚠️" : "ℹ️"}
        </div>
        <div style={{ flex: 1, fontSize: 13, lineHeight: 1.35 }}>{text}</div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onClose}
          style={{ padding: "6px 10px", borderRadius: 12 }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

type YearPoint = { year: number; total: number };

function HistoryChart({ data }: { data: YearPoint[] }) {
  if (!data.length) {
    return (
      <div className="card" style={{ padding: 16, borderRadius: 18 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Yearly depreciation</div>
        <div style={{ color: "var(--muted)", marginTop: 6, fontSize: 13 }}>
          No depreciation history yet. Run annual depreciation to generate history lines.
        </div>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.total), 1);
  const height = 140;

  return (
    <div className="card" style={{ padding: 16, borderRadius: 18 }}>
      <div className="row-between" style={{ gap: 12, marginBottom: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Yearly depreciation</div>
        <div style={{ color: "var(--muted)", fontSize: 12 }}>
          Last {data.length} year{data.length > 1 ? "s" : ""}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height }}>
        {data.map((d) => {
          const h = Math.round((d.total / max) * height);
          return (
            <div key={d.year} style={{ flex: 1, minWidth: 44 }}>
              <div
                title={`${d.year}: ${money(d.total)}`}
                style={{
                  height: h,
                  borderRadius: 14,
                  background: "rgba(99,102,241,.25)",
                  border: "1px solid rgba(99,102,241,.35)",
                }}
              />
              <div style={{ textAlign: "center", marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
                {d.year}
              </div>
              <div style={{ textAlign: "center", marginTop: 2, fontSize: 12, fontWeight: 800 }}>
                {money(d.total)}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 10 }}>
        Tip: This chart uses <code>dep_lines(year, amount)</code>. If your table uses different column names,
        tell me and I’ll adjust it.
      </div>
    </div>
  );
}

export default function DepreciationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [toast, setToast] = useState<{ text: string; kind?: ToastKind } | null>(null);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [runningDep, setRunningDep] = useState(false);

  const [history, setHistory] = useState<YearPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  function showToast(text: string, kind: ToastKind = "info") {
    setToast({ text, kind });
    window.clearTimeout((showToast as any)._t);
    (showToast as any)._t = window.setTimeout(() => setToast(null), 3500);
  }

  async function requireUserId(): Promise<string | null> {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      setMsg(error.message);
      return null;
    }
    const userId = data.user?.id ?? null;
    if (!userId) {
      setMsg("Please login first.");
      return null;
    }
    return userId;
  }

  async function loadAssets() {
    setLoading(true);
    setMsg(null);

    const userId = await requireUserId();
    if (!userId) {
      setAssets([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("assets")
      .select("id,name,category,purchase_date,cost,rate,nbv,accumulated_depreciation,created_at,user_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      setAssets([]);
      setLoading(false);
      return;
    }

    setAssets((data ?? []) as Asset[]);
    setLoading(false);
  }

  async function loadYearlyHistory() {
    setHistoryLoading(true);

    const userId = await requireUserId();
    if (!userId) {
      setHistory([]);
      setHistoryLoading(false);
      return;
    }

    // Expected schema: dep_lines(user_id, asset_id, year, amount)
    const { data, error } = await supabase
      .from("dep_lines")
      .select("year,amount,user_id")
      .eq("user_id", userId);

    if (error) {
      // Don’t hard-fail the page if dep_lines doesn’t exist yet.
      setHistory([]);
      setHistoryLoading(false);
      return;
    }

    const rows = (data ?? []) as Array<{ year: number; amount: number }>;
    const map = new Map<number, number>();
    for (const r of rows) {
      const y = Number((r as any).year);
      const a = Number((r as any).amount ?? 0);
      if (!Number.isFinite(y)) continue;
      map.set(y, (map.get(y) ?? 0) + (Number.isFinite(a) ? a : 0));
    }

    const points = Array.from(map.entries())
      .map(([year, total]) => ({ year, total }))
      .sort((a, b) => a.year - b.year);

    // Keep last 6 years for a clean chart
    const last = points.slice(-6);
    setHistory(last);
    setHistoryLoading(false);
  }

  async function runAnnualDepreciation() {
    const ok = confirm(
      "Run annual depreciation for all assets? This will update NBV and accumulated depreciation and record a history line per asset."
    );
    if (!ok) return;

    setMsg(null);
    setRunningDep(true);

    try {
      const userId = await requireUserId();
      if (!userId) return;

      const { data: rows, error: fetchErr } = await supabase
        .from("assets")
        .select("id,cost,rate,accumulated_depreciation,nbv,user_id")
        .eq("user_id", userId);

      if (fetchErr) throw fetchErr;

      const assetsList = (rows ?? []) as any[];
      if (assetsList.length === 0) {
        setMsg("No assets found.");
        return;
      }

      const year = new Date().getFullYear();

      for (const a of assetsList) {
        const cost = Number(a.cost) || 0;
        const rate = Number(a.rate) || 0;
        const acc = Number(a.accumulated_depreciation ?? 0) || 0;

        // Straight-line annual depreciation
        const annual = Math.max(0, cost * rate);

        // Never depreciate below zero NBV
        const remaining = Math.max(0, cost - acc);
        const applied = Math.min(annual, remaining);

        const newAcc = acc + applied;
        const newNbv = Math.max(0, cost - newAcc);

        const { error: updErr } = await supabase
          .from("assets")
          .update({
            accumulated_depreciation: newAcc,
            nbv: newNbv,
          })
          .eq("id", a.id)
          .eq("user_id", userId);

        if (updErr) throw updErr;

        // Record a yearly line (best-effort; ignore if table/columns don’t exist)
        try {
          const payload = { user_id: userId, asset_id: a.id, year, amount: applied };
          const { error: lineErr } = await supabase
            .from("dep_lines")
            .upsert(payload as any, { onConflict: "user_id,asset_id,year" });

          if (lineErr) {
            // fallback insert (in case onConflict isn’t supported / no unique constraint)
            await supabase.from("dep_lines").insert(payload as any);
          }
        } catch {
          // ignore
        }
      }

      showToast("Annual depreciation applied successfully ✅", "success");
      setMsg(null);
      await loadAssets();
      await loadYearlyHistory();
    } catch (e: any) {
      showToast(e?.message ?? "Failed to run depreciation.", "error");
      setMsg(e?.message ?? "Failed to run depreciation.");
    } finally {
      setRunningDep(false);
    }
  }

  async function deleteAsset(assetId: string) {
    const ok = confirm("Delete this asset? This cannot be undone.");
    if (!ok) return;

    setMsg(null);

    const userId = await requireUserId();
    if (!userId) return;

    // If you created dep_lines, remove any lines first (avoids FK issues)
    try {
      await supabase.from("dep_lines").delete().eq("asset_id", assetId).eq("user_id", userId);
    } catch {
      // ignore if dep_lines doesn't exist
    }

    const { error } = await supabase.from("assets").delete().eq("id", assetId).eq("user_id", userId);

    if (error) {
      setMsg(error.message);
      return;
    }

    showToast("Asset deleted.", "success");
    await loadAssets();
    await loadYearlyHistory();
  }

  useEffect(() => {
    loadAssets();
    loadYearlyHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show a friendly toast after redirects like /depreciation?saved=1
  useEffect(() => {
    const saved = searchParams.get("saved");
    const updated = searchParams.get("updated");
    if (saved === "1") showToast("Asset saved successfully ✅", "success");
    if (updated === "1") showToast("Asset updated ✅", "success");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const totals = useMemo(() => {
    const count = assets.length;
    const totalNBV = assets.reduce((s, a) => s + Number(a.nbv ?? 0), 0);
    return { count, totalNBV };
  }, [assets]);

  return (
    <>
      {toast ? <Toast text={toast.text} kind={toast.kind} onClose={() => setToast(null)} /> : null}

      <main className="auth-shell">
        <div className="auth-card card card-pad" style={{ width: "100%", maxWidth: 980 }}>
          {/* Header */}
          <div className="row-between" style={{ gap: 12, marginBottom: 10 }}>
            <button className="btn btn-ghost" type="button" onClick={() => router.push("/dashboard")}>
              ← Dashboard
            </button>

            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-0.02em" }}>Depreciation</div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                Assets: <strong>{totals.count}</strong> • Total NBV: <strong>{money(totals.totalNBV)}</strong>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={runAnnualDepreciation}
                disabled={runningDep}
                title="Apply straight-line annual depreciation to all assets"
              >
                {runningDep ? "Running..." : "Run Annual Depreciation"}
              </button>

              <button className="btn btn-primary" type="button" onClick={() => router.push("/depreciation/new")}>
                + Add Asset
              </button>
            </div>
          </div>

          {/* Message / Error */}
          {msg ? (
            <div className="card" style={{ padding: 12, borderRadius: 16, marginBottom: 14 }}>
              {msg}
            </div>
          ) : null}

          {/* Chart */}
          <div style={{ marginBottom: 12 }}>
            {historyLoading ? (
              <div className="card" style={{ padding: 16, borderRadius: 18 }}>Loading depreciation history…</div>
            ) : (
              <HistoryChart data={history} />
            )}
          </div>

          {/* Body */}
          {loading ? (
            <div className="card" style={{ padding: 16, borderRadius: 18 }}>
              Loading assets…
            </div>
          ) : assets.length === 0 ? (
            <div className="card" style={{ padding: 18, borderRadius: 18 }}>
              <div style={{ fontWeight: 800, fontSize: 18 }}>No assets yet</div>
              <div style={{ color: "var(--muted)", marginTop: 6 }}>
                Add your first asset to start tracking depreciation.
              </div>

              <div style={{ marginTop: 14 }}>
                <button className="btn btn-primary" onClick={() => router.push("/depreciation/new")}>
                  Record Asset
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {assets.map((a) => {
                const ratePct =
                  a.rate !== null && a.rate !== undefined ? `${(Number(a.rate) * 100).toFixed(2)}%` : "—";

                return (
                  <div
                    key={a.id}
                    className="card"
                    style={{
                      padding: 14,
                      borderRadius: 18,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: 16,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {a.name}
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                        {(a.category ?? "Uncategorized")} • {a.purchase_date ?? "No date"} • Rate:{" "}
                        <strong>{ratePct}</strong>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 900 }}>NBV: {money(Number(a.nbv ?? 0))}</div>
                        <div style={{ color: "var(--muted)", fontSize: 12 }}>
                          Cost: {money(Number(a.cost ?? 0))}
                        </div>
                      </div>

                      <button className="btn btn-ghost" type="button" onClick={() => deleteAsset(a.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
