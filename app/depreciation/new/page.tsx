"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type AssetClass = { label: string; rate: number }; // rate as decimal (e.g., 0.125 = 12.5%)

export default function DepreciationNewPage() {
  const router = useRouter();
  const { status: microStatus, ping } = useMicroStatus();


  // Tanzania (tax) class rates are included as a helpful reference list.
  // For PERSONAL use (accounting-style), you can edit these to match how you want to depreciate internally.
  const ASSET_CLASSES: AssetClass[] = useMemo(
    () => [
      { label: "Class 1: Computers & Data Equipment", rate: 0.375 },
      { label: "Class 2: Motor Vehicles / Plant & Machinery", rate: 0.25 },
      { label: "Class 3: Furniture & Fixtures", rate: 0.125 },
      { label: "Buildings (other)", rate: 0.05 },
      { label: "Buildings (agri/livestock/fish)", rate: 0.2 },
      { label: "Other", rate: 0.1 },
      { label: "Custom (enter rate)", rate: 0 },
    ],
    []
  );

  const infoRates = useMemo(
    () => ASSET_CLASSES.filter((c) => c.label !== "Custom (enter rate)"),
    [ASSET_CLASSES]
  );

  const [name, setName] = useState("");
  const [categoryLabel, setCategoryLabel] = useState(ASSET_CLASSES[1].label); // default to Class 2
  const [purchaseDate, setPurchaseDate] = useState("");
  const [cost, setCost] = useState("");
  const [rate, setRate] = useState(String(ASSET_CLASSES[1].rate)); // decimal string

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const ratePercent = useMemo(() => {
    const n = Number(rate);
    if (!Number.isFinite(n) || n < 0) return null;
    return n * 100;
  }, [rate]);

  function onChangeCategory(nextLabel: string) {
    setCategoryLabel(nextLabel);
    const found = ASSET_CLASSES.find((c) => c.label === nextLabel);
    if (!found) return;

    if (found.label !== "Custom (enter rate)") {
      setRate(String(found.rate));
    } else {
      setRate("");
    }
  }

  async function saveAsset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);

    const cleanName = name.trim();
    const costNum = Number(cost);
    const rateNum = Number(rate);

    if (!cleanName) return setMsg("Please enter asset name.");
    if (!purchaseDate) return setMsg("Please select purchase date.");
    if (!Number.isFinite(costNum) || costNum <= 0) return setMsg("Enter a valid cost.");
    if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 1)
      return setMsg("Rate must be a decimal between 0 and 1 (e.g. 0.125).");

    setSaving(true);

    const { error } = await supabase.from("assets").insert({
      name: cleanName,
      category: categoryLabel === "Custom (enter rate)" ? "Custom" : categoryLabel,
      purchase_date: purchaseDate,
      cost: costNum,
      rate: rateNum,
      method: "SL", // personal use: straight-line annual
      accumulated_depreciation: 0,
      nbv: costNum,
      last_depreciation_year: null, // optional column (recommended)
    });

    setSaving(false);

    if (error) return setMsg(error.message);

    // Tiny confirmation (no popup)
    ping("Saved • updated just now");

    // Give the UI a beat to show the confirmation, then navigate
    setTimeout(() => router.push("/depreciation"), 450);
  }

  

  return (
    <main className="auth-shell">
      {/* Two-card layout: form (left) + info (right). Stacks on mobile */}
      <div className="dep-layout">
        {/* LEFT: Main Form Card */}
        <div
          className="auth-card card card-pad"
          style={{ width: "100%", position: "relative", zIndex: 1 }}
        >
          <div className="row-between dep-header" style={{ gap: 12, marginBottom: 10 }}>
            <button className="btn btn-ghost" type="button" onClick={() => router.back()}>
              ← Back
            </button>

            <div style={{ fontWeight: 900, letterSpacing: "-0.02em" }}>Record Asset</div>

            <div className="row dep-header-actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>

              <button className="btn btn-ghost" type="button" onClick={() => router.push("/depreciation")}>
                Asset Register
              </button>
            </div>
          </div>

          <p style={{ marginTop: 0, marginBottom: 16, color: "var(--muted)" }}>
            Add an asset and we’ll track depreciation annually.
          </p>

          {msg ? (
            <div className="card" style={{ padding: 12, borderRadius: 16, marginBottom: 14 }}>
              {msg}
            </div>
          ) : null}

            {microStatus ? (
              <div className="micro-status" aria-live="polite">
                <span className="dot" /> {microStatus.text}
              </div>
            ) : null}


          <form onSubmit={saveAsset} className="stack-16">
            <div style={{ display: "grid", gap: 12 }}>
              <label>
                <div className="stat-label">ASSET NAME</div>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Laptop Dell"
                  required
                />
              </label>

              <label>
                <div className="stat-label">CATEGORY</div>
                <select
                  className="input"
                  value={categoryLabel}
                  onChange={(e) => onChangeCategory(e.target.value)}
                >
                  {ASSET_CLASSES.map((c) => (
                    <option key={c.label} value={c.label}>
                      {c.label}
                      {c.label !== "Custom (enter rate)" ? ` — ${(c.rate * 100).toFixed(2)}%` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="dep-two-col">
                <label>
                  <div className="stat-label">PURCHASE DATE</div>
                  <input
                    className="input"
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    required
                  />
                </label>

                <label>
                  <div className="stat-label">COST</div>
                  <input
                    className="input"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    placeholder="e.g. 2500000"
                    inputMode="decimal"
                    required
                  />
                </label>
              </div>

              <label>
                <div className="stat-label">ANNUAL RATE (DECIMAL)</div>
                <input
                  className="input"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="e.g. 0.125"
                  inputMode="decimal"
                  required
                />
                <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12 }}>
                  Example: <strong>0.125</strong> = <strong>12.5%</strong>
                  {ratePercent !== null ? (
                    <>
                      {" "}
                      • Current: <strong>{ratePercent.toFixed(2)}%</strong>
                    </>
                  ) : null}
                </div>
              </label>

              <div className="row-between dep-footer-actions" style={{ gap: 12, marginTop: 6 }}>
                <button className="btn btn-ghost" type="button" onClick={() => router.back()}>
                  Cancel
                </button>

                <button className="btn btn-primary" type="submit" disabled={saving} style={{ minWidth: 160 }}>
                  {saving ? "Saving..." : "Save Asset"}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* RIGHT: Info Card */}
        <aside className="card card-pad" style={{ width: "100%", position: "relative", zIndex: 0 }}>
          <div style={{ fontWeight: 900, letterSpacing: "-0.02em", marginBottom: 10 }}>
            Depreciation Info
          </div>

          <div style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>
            Depreciation is applied <strong>once per year</strong>. For personal tracking here, we’re using:
            <div style={{ marginTop: 8 }}>
              Annual depreciation (straight-line) ≈ <strong>Cost × Rate</strong>
            </div>
          </div>

          <div className="card" style={{ padding: 12, borderRadius: 16, marginTop: 14 }}>
            <div className="stat-label" style={{ marginBottom: 8 }}>
              COMMON RATES (REFERENCE)
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {infoRates.map((c) => (
                <div key={c.label} className="row-between" style={{ gap: 12 }}>
                  <div style={{ fontWeight: 700 }}>{c.label}</div>
                  <div style={{ color: "var(--muted)" }}>{(c.rate * 100).toFixed(2)}%</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 12, lineHeight: 1.45 }}>
            Tip: If your rate is different, pick <strong>Custom</strong> and enter your own decimal rate.
          </div>
        </aside>
      </div>

      {/* Layout styles */}
      <style jsx>{`
        .dep-layout {
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
          display: grid;
          gap: 60px;
          grid-template-columns: 1fr;
          align-items: start;
        }
        @media (min-width: 960px) {
          .dep-layout {
            grid-template-columns: 1.6fr 1fr;
          }
        }

        /* --- Mobile-first tweaks --- */

        /* Make header wrap nicely on small screens */
        .dep-header {
          flex-wrap: wrap;
        }
        .dep-header-actions {
          width: 100%;
          justify-content: flex-end;
        }
        @media (min-width: 640px) {
          .dep-header-actions {
            width: auto;
          }
        }

        /* Date + Cost grid: 1 col on mobile, 2 cols on sm+ */
        .dep-two-col {
          display: grid;
          gap: 12px;
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .dep-two-col {
            grid-template-columns: 1fr 1fr;
          }
        }

        /* Footer buttons: stack on mobile, row on sm+ */
        .dep-footer-actions {
          flex-direction: column;
          align-items: stretch;
        }
        .dep-footer-actions :global(button) {
          width: 100%;
        }
        @media (min-width: 640px) {
          .dep-footer-actions {
            flex-direction: row;
            align-items: center;
          }
          .dep-footer-actions :global(button) {
            width: auto;
          }
        }
      `}</style>
    </main>
  );
}
// ---------------- MICRO STATUS (tiny confirmations) ----------------
function useMicroStatus(timeoutMs = 1800) {
  const [status, setStatus] = useState<{ text: string; at: number } | null>(null);
  const timerRef = useRef<number | null>(null);

  const ping = (text: string) => {
    setStatus({ text, at: Date.now() });
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setStatus(null), timeoutMs);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  return { status, ping };
}


