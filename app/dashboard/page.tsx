"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { computeSmartAlerts, type Tx } from "@/lib/smart-alerts";
import Link from "next/link";
import { calculateFinancialHealth } from "@/lib/financial-health";

import {

  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// ---------------- TYPES ----------------

type ThemeMode = "system" | "dark" | "light";
type Currency = "TZS" | "USD";
type TxnType = "expense" | "income";

type Category = {
  id: string;
  name: string;
  type: TxnType;
  budget_limit?: number;
};

type Txn = {
  id: string;
  type: TxnType;
  amount: number;
  note: string | null;
  date: string; // YYYY-MM-DD
  category_name?: string | null;
  category_id?: string;
};

type Subscription = {
  id: string;
  name: string;
  amount: number;
  category_id?: string;
  category?: { name: string };
};

type SavingsGoal = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
};

// ---------------- HELPERS ----------------

function formatMoney(amount: number, currency: Currency) {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const parts = abs.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${currency} ${parts.join(".")}`;
}

function getSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved = mode === "system" ? getSystemTheme() : mode;
  root.dataset.theme = resolved;
}

function getCurrentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  
  const toISO = (d: Date) => {
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split("T")[0];
  };
  
  return { start: toISO(start), end: toISO(end) };
}

function toDate(d: string | Date) {
  return d instanceof Date ? d : new Date(d);
}
function inRange(dt: Date, start: Date, end: Date) {
  return dt >= start && dt < end;
}


// Chart Colors
const PIE_COLORS = [
  "#00E0FF", "#A020F0", "#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#FF9F45"
];



// ---------------- AI FOLLOW-UP CHAT ----------------
type ChatMsg = { role: "user" | "assistant"; content: string };

function FollowUpChat({
  context,
  disabled,
  storageKey = "ai_followup_thread_v1",
  onLastUpdated,
}: {
  context: any;
  disabled?: boolean;
  storageKey?: string;
  onLastUpdated?: (d: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thread, setThread] = useState<ChatMsg[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Load thread from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setThread(JSON.parse(raw));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist thread
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(thread));
    } catch {}
  }, [thread, storageKey]);

  // Auto-scroll
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [thread, open]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading || disabled) return;

    const nextThread: ChatMsg[] = [...thread, { role: "user", content: q }];
    setThread(nextThread);
    setInput("");
    setLoading(true);

    const payload = {
      question: q,
      context: context ?? null,
      history: nextThread.slice(-6),
    };

    try {
      // Prefer dedicated follow-up endpoint if present
      let res = await fetch("/api/ai/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // Fallback: reuse summary endpoint if follow-up route isn't implemented yet
      if (res.status === 404) {
        res = await fetch("/api/ai/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(context ?? {}), question: q, history: payload.history }),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "AI request failed");

      const answer = String(data?.answer ?? data?.text ?? "");
      setThread((prev) => [...prev, { role: "assistant", content: answer || "No response from AI." }]);
    } catch (e: any) {
      setThread((prev) => [
        ...prev,
        { role: "assistant", content: `Sorry mate — I hit an error: ${e?.message || "unknown"}` },
      ]);
    } finally {
      onLastUpdated?.(new Date());
      setLoading(false);
    }
  };

  const clearChat = () => {
    setThread([]);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  };

  return (
    <div className="ai-followup">
      <button
        type="button"
        className="ai-followup-toggle"
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        disabled={disabled}
      >
        {open ? "Hide follow-up" : "Ask a follow-up"}
      </button>

      {open && (
        <div className="ai-followup-card">
          <div className="ai-followup-chips">
            {[
              "How can I reduce expenses next month?",
              "What if income drops by 20%?",
              "Is this spending pattern risky?",
            ].map((t) => (
              <button
                key={t}
                type="button"
                className="ai-chip"
                onClick={() => {
                  if (disabled) return;
                          setInput(t);
                }}
                disabled={disabled}
              >
                {t}
              </button>
            ))}
          </div>

          {thread.length > 0 && (
            <div ref={listRef} className="ai-followup-thread">
              {thread.map((m, i) => (
                <div key={i} className={`ai-bubble ${m.role === "user" ? "user" : "assistant"}`}>
                  {m.content}
                </div>
              ))}
            </div>
          )}

          <div className="ai-followup-inputrow">
            <input
              className="ai-followup-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your numbers…"
              disabled={disabled || loading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary ai-followup-send"
              onClick={() => {
                      send();
              }}
              disabled={disabled || loading || !input.trim()}
            >
              {loading ? "Thinking…" : "Send"}
            </button>
          </div>

          <div className="ai-followup-footer">
            <span className="ai-followup-tip">Tip: hit Enter to send.</span>
            <button type="button" className="ai-followup-clear" onClick={clearChat} disabled={disabled}>
              Clear chat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {

  // ---------------- HAPTICS ----------------
  const hapticLight = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10);
  };
  const hapticMedium = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(18);
  };
  const hapticSuccess = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([12, 40, 12]);
  };

  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

// ---------------- STATE ----------------

  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string>("");
  const [aiCopied, setAiCopied] = useState(false);


  
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [currency, setCurrency] = useState<Currency>("TZS");

  // auth
  const [email, setEmail] = useState<string>("");
  const [username, setUsername] = useState<string>("User");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  
  const initials = useMemo(() => {
    const base = (username || email || "U").trim();
    const parts = base.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? "U";
    const b = parts.length > 1 ? parts[1][0] : "";
    return (a + b).toUpperCase();
  }, [username, email]);

  // data
  const [categories, setCategories] = useState<Category[]>([]);
  const [listTxns, setListTxns] = useState<Txn[]>([]);
  const [monthTxns, setMonthTxns] = useState<Txn[]>([]);
  const [compareMode, setCompareMode] = useState<"this" | "last" | "avg3">("this");
  const [compareTxns, setCompareTxns] = useState<Txn[]>([]);

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);

  const [msg, setMsg] = useState<string>("");

  // stats
  const [incomeTotal, setIncomeTotal] = useState<number>(0);
  const [expenseTotal, setExpenseTotal] = useState<number>(0);

  // depreciation summary (safe-known defaults; asset table can be added later)
  type DepSummary = {
    assetsCount: number;
    nbvTotal: number;
    depThisYear: number;
    lastRun: string | null;
  };

  const [depSummary, setDepSummary] = useState<DepSummary>({
    assetsCount: 0,
    nbvTotal: 0,
    depThisYear: 0,
    lastRun: null,
  });

  // ui state
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [seeding, setSeeding] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  // ---------------- UX POLISH ----------------
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const formatLastUpdated = (d: Date) =>
    new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(d);

  // Keyboard shortcuts:
  // - Ctrl/Cmd + K: open AI Insight
  // - Esc: close AI Insight / Settings
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping =
        tag === "input" || tag === "textarea" || (target as any)?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        if (!isTyping) {
          e.preventDefault();
          setAiOpen(true);
        }
        return;
      }

      if (e.key === "Escape") {
        if (aiOpen) setAiOpen(false);
        if (settingsOpen) setSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [aiOpen, settingsOpen]);
  const [exporting, setExporting] = useState<boolean>(false);
  const [uploadingAvatar, setUploadingAvatar] = useState<boolean>(false);

  // forms
  const [settingsTab, setSettingsTab] = useState<"general" | "categories">("general");
  const [newCatName, setNewCatName] = useState("");
  const [newCatLimit, setNewCatLimit] = useState("");
  const [newCatType, setNewCatType] = useState<TxnType>("expense");

  // Subscriptions Form
  const [newSubName, setNewSubName] = useState("");
  const [newSubAmount, setNewSubAmount] = useState("");
  const [newSubCatId, setNewSubCatId] = useState("");

  const [newGoalName, setNewGoalName] = useState("");
  const [newGoalTarget, setNewGoalTarget] = useState("");

  const [txnType, setTxnType] = useState<TxnType>("expense");
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split("T")[0];
  });
  const [categoryId, setCategoryId] = useState<string>("");

  const [search, setSearch] = useState<string>("");
  const [showAllRecent, setShowAllRecent] = useState<boolean>(false);
  const [reportStart, setReportStart] = useState<string>("");
  const [reportEnd, setReportEnd] = useState<string>("");

  // ---------------- LOGIC ----------------

  // Area Chart Data
  const chartData = useMemo(() => {
    const sorted = [...monthTxns].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const map = new Map<string, { date: string; income: number; expense: number }>();

    sorted.forEach((t) => {
      if (!map.has(t.date)) {
        map.set(t.date, { date: t.date, income: 0, expense: 0 });
      }
      const entry = map.get(t.date)!;
      if (t.type === "income") entry.income += t.amount;
      else entry.expense += t.amount;
    });

    return Array.from(map.values());
  }, [monthTxns]);

  // Pie Chart Data
  const pieData = useMemo(() => {
    const map = new Map<string, number>();
    monthTxns.forEach(t => {
      if (t.type === 'expense') {
        const cat = t.category_name || "Uncategorized";
        map.set(cat, (map.get(cat) || 0) + t.amount);
      }
    });
    
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [monthTxns]);

  // Budget Status
  const budgetStatus = useMemo(() => {
    if (txnType !== "expense" || !categoryId) return null;
    
    const cat = categories.find(c => c.id === categoryId);
    if (!cat || !cat.budget_limit || cat.budget_limit <= 0) return null;

    const spentThisMonth = monthTxns
      .filter(t => t.category_name === cat.name && t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const currentEntry = Number(amount) || 0;
    const totalAfter = spentThisMonth + currentEntry;
    const isOver = totalAfter > cat.budget_limit;
    return {
      limit: cat.budget_limit,
      spent: spentThisMonth,
      isOver,
      totalAfter
    };
  }, [categoryId, monthTxns, amount, categories, txnType]);

  const subscriptionTotal = useMemo(() => {
    return subscriptions.reduce((sum, sub) => sum + sub.amount, 0);
  }, [subscriptions]);

  // Boot
  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("themeMode")) as ThemeMode | null;
    const storedCurrency = (typeof window !== "undefined" && localStorage.getItem("currency")) as Currency | null;
    const mode: ThemeMode = stored ?? "system";
    
    setThemeMode(mode);
    applyTheme(mode);
    if (storedCurrency) setCurrency(storedCurrency);

    const range = getCurrentMonthRange();
    setReportStart(range.start);
    setReportEnd(range.end);

    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    const handler = () => {
      if ((localStorage.getItem("themeMode") as ThemeMode) === "system") {
        applyTheme("system");
      }
    };
    mq?.addEventListener?.("change", handler);
    return () => mq?.removeEventListener?.("change", handler);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("themeMode", themeMode);
    applyTheme(themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("currency", currency);
  }, [currency]);

  

  
  // ---------------- AI ----------------


  

  // Monthly comparison snapshot (this month vs last month vs 3-month average)
  const comparison = useMemo(() => {
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), 1);

    const thisStart = base;
    const thisEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastEnd = new Date(now.getFullYear(), now.getMonth(), 1);

    const avgStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const avgEnd = thisStart;

    const txThis = (compareTxns.length ? compareTxns : monthTxns).filter((t) => {
      const d = toDate(t.date as any);
      return inRange(d, thisStart, thisEnd);
    });

    const txLast = (compareTxns.length ? compareTxns : []).filter((t) => {
      const d = toDate(t.date as any);
      return inRange(d, lastStart, lastEnd);
    });

    const txAvg3 = (compareTxns.length ? compareTxns : []).filter((t) => {
      const d = toDate(t.date as any);
      return inRange(d, avgStart, avgEnd);
    });

    const sumByType = (txs: any[], type: "income" | "expense") =>
      txs.filter((t) => t.type === type).reduce((a, t) => a + (Number(t.amount) || 0), 0);

    const catTotals = (txs: any[]) => {
      const out: Record<string, number> = {};
      for (const t of txs) {
        if (t.type !== "expense") continue;
        const k = (t.category_name || "Other").toString();
        out[k] = (out[k] || 0) + (Number(t.amount) || 0);
      }
      return out;
    };

    const thisIncome = sumByType(txThis, "income");
    const thisExpense = sumByType(txThis, "expense");
    const lastIncome = sumByType(txLast, "income");
    const lastExpense = sumByType(txLast, "expense");

    const avg3Income = txAvg3.length ? sumByType(txAvg3, "income") / 3 : 0;
    const avg3Expense = txAvg3.length ? sumByType(txAvg3, "expense") / 3 : 0;

    const thisCats = catTotals(txThis);
    const lastCats = catTotals(txLast);

    const pct = (cur: number, prev: number) => (prev ? ((cur - prev) / prev) * 100 : null);

    const drivers = () => {
      const keys = new Set([...Object.keys(thisCats), ...Object.keys(lastCats)]);
      return Array.from(keys)
        .map((k) => ({
          category: k,
          delta: (thisCats[k] || 0) - (lastCats[k] || 0),
          this: thisCats[k] || 0,
          last: lastCats[k] || 0,
        }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 3);
    };

    return {
      mode: compareMode,
      totals: {
        this: { income: thisIncome, expenses: thisExpense, balance: thisIncome - thisExpense },
        last: { income: lastIncome, expenses: lastExpense, balance: lastIncome - lastExpense },
        avg3: { income: avg3Income, expenses: avg3Expense, balance: avg3Income - avg3Expense },
      },
      deltas: {
        expenses_vs_last_pct: pct(thisExpense, lastExpense),
        income_vs_last_pct: pct(thisIncome, lastIncome),
        expenses_vs_avg3_pct: pct(thisExpense, avg3Expense),
        income_vs_avg3_pct: pct(thisIncome, avg3Income),
        top_drivers_vs_last: drivers(),
      },
      transactions: {
        this_count: txThis.length,
        last_count: txLast.length,
        avg3_count: txAvg3.length,
      },
    };
  }, [compareMode, compareTxns, monthTxns]);

const aiContext = useMemo(() => {
    const monthLabel = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });
    const income = Number(incomeTotal ?? 0);
    const expenses = Number(expenseTotal ?? 0);
    const balance = income - expenses;

    return {
      month: monthLabel,
      currency,
      income,
      expenses,
      balance,
      transactionsCount: monthTxns?.length ?? 0,
      comparison,
    };
  }, [currency, incomeTotal, expenseTotal, monthTxns, comparison]);

  const fetchAiSummary = async () => {
    try {
      setAiLoading(true);
      setAiResponse("");

      const monthLabel = new Date().toLocaleString("en-GB", {
        month: "long",
        year: "numeric",
      });
      const income = Number(incomeTotal ?? 0);
      const expenses = Number(expenseTotal ?? 0);
      const balance = income - expenses;

      const res = await fetch("/api/ai/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: monthLabel,
          currency,
          income,
          expenses,
          balance,
          // optional context for better insight (kept light)
          transactionsCount: monthTxns?.length ?? 0,
          compareMode,
          comparison: aiContext?.comparison ?? null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "AI request failed");
      setAiResponse(data?.text || "No response from AI.");
      hapticSuccess();
    } catch (e: any) {
      setAiResponse(e?.message || "Something went wrong.");
    } finally {
      setAiLoading(false);
    }
  };

  // ---------------- AI UI formatting ----------------
  const renderInline = (text: string) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, idx) =>
      idx % 2 === 1 ? (
        <strong key={idx} className="ai-strong">
          {part}
        </strong>
      ) : (
        <span key={idx}>{part}</span>
      )
    );
  };

  const renderAiText = (text: string) => {
    const cleaned = (text || "").trim();
    if (!cleaned) return null;

    // Split into paragraph-ish blocks (blank lines separate blocks)
    const blocks = cleaned.split(/\n\s*\n/g);

    const isBullet = (l: string) => /^(-\s+|\*\s+|•\s+)/.test(l);
    const stripBullet = (l: string) => l.replace(/^(-\s+|\*\s+|•\s+)/, "");

    const isSectionTitle = (l: string) =>
      // e.g. "**1) Summary**", "1) Summary", "Summary:", "## Summary"
      /^\*\*\d+\)\s+.+\*\*$/.test(l) ||
      /^\d+\)\s+.+$/.test(l) ||
      /^#{1,6}\s+/.test(l) ||
      /:$/.test(l);

    const stripSectionTitle = (l: string) => {
      let s = l.trim();
      // remove markdown heading hashes
      s = s.replace(/^#{1,6}\s+/, "");
      // remove trailing colon
      s = s.replace(/:$/, "");
      // remove bold wrapper if it's **...**
      if (s.startsWith("**") && s.endsWith("**")) s = s.slice(2, -2);
      return s.trim();
    };

    return blocks.map((block, bIdx) => {
      const lines = block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length === 0) return null;

      // If the whole block is bullets, render a list
      const bulletish = lines.length >= 1 && lines.every((l) => isBullet(l));
      if (bulletish) {
        return (
          <ul key={bIdx} className="ai-list">
            {lines.map((l, i) => (
              <li key={i}>{renderInline(stripBullet(l))}</li>
            ))}
          </ul>
        );
      }

      // Mixed blocks: allow a section title + bullet lines after it
      if (lines.length > 1 && isSectionTitle(lines[0]) && lines.slice(1).every((l) => isBullet(l))) {
        const title = stripSectionTitle(lines[0]);
        return (
          <div key={bIdx} className="ai-section">
            <div className="ai-heading">{renderInline(title)}</div>
            <ul className="ai-list">
              {lines.slice(1).map((l, i) => (
                <li key={i}>{renderInline(stripBullet(l))}</li>
              ))}
            </ul>
          </div>
        );
      }

      // Single-line section title
      if (lines.length === 1 && isSectionTitle(lines[0])) {
        return (
          <div key={bIdx} className="ai-heading">
            {renderInline(stripSectionTitle(lines[0]))}
          </div>
        );
      }

      // Normal paragraph with line breaks + remove accidental leading bullets
      return (
        <p key={bIdx} className="ai-paragraph">
          {lines.map((l, i) => (
            <span key={i}>
              {renderInline(isBullet(l) ? stripBullet(l) : l.replace(/^#{1,6}\s+/, ""))}
              {i < lines.length - 1 ? <br /> : null}
            </span>
          ))}
        </p>
      );
    });
  };



  const copyAiResponse = async () => {
    if (!aiResponse) return;
    try {
      await navigator.clipboard?.writeText(aiResponse);
      setAiCopied(true);
      hapticSuccess();
      window.setTimeout(() => setAiCopied(false), 1200);
    } catch {
      // fallback
      try {
        const ta = document.createElement("textarea");
        ta.value = aiResponse;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setAiCopied(true);
        hapticSuccess();
        window.setTimeout(() => setAiCopied(false), 1200);
      } catch {}
    }
  };


  // ---------------- AI (placeholder) ----------------
  // You still had UI calling runAiSummary(), but the function was missing.
  // This keeps the app stable; we’ll replace it with the real Gemini flow next.
  const runAiSummary = (openOnly: boolean) => {
    if (openOnly) {
      hapticLight();
      setAiOpen(true);
      return;
    }
    hapticMedium();
    fetchAiSummary();
  };

// Auth & Load
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setEmail(session.user.email ?? "");
        setUsername(
          (session.user.user_metadata?.full_name as string) || 
          (session.user.email?.split("@")[0] ?? "User")
        );
        const metaAvatar = session.user.user_metadata?.avatar_url;
        if (metaAvatar) setAvatarUrl(metaAvatar);

        loadAll(session.user);
      } else if (event === "SIGNED_OUT") {
        router.replace("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  async function loadAll(currentUser: any) {
    setLoading(true);
    setMsg("");
    if (!currentUser) {
      setLoading(false);
      return;
    }

    try {

    const range = getCurrentMonthRange();
    // For comparison (last month + 3-month average), fetch a wider window
    const compareStart = (() => {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const start = new Date(y, m - 6, 1);
      const offset = start.getTimezoneOffset() * 60000;
      return new Date(start.getTime() - offset).toISOString().split("T")[0];
    })();

    const [catsRes, listRes, monthRes, compareRes, subRes, goalRes] = await Promise.all([
      supabase.from("categories").select("id,name,type,budget_limit").order("name", { ascending: true }),
      supabase.from("transactions").select("id,type,amount,note,date,category:categories(name,id)").order("date", { ascending: false }).limit(50),
      supabase.from("transactions").select("id,type,amount,note,date,category:categories(name)").gte("date", range.start).lte("date", range.end).order("date", { ascending: true }),
      supabase.from("transactions").select("id,type,amount,note,date,category:categories(name)").gte("date", compareStart).lte("date", range.end).order("date", { ascending: true }),
      supabase.from("subscriptions").select("*, category:categories(name)").eq("user_id", currentUser.id).order("created_at", { ascending: true }),
      supabase.from("savings_goals").select("*").eq("user_id", currentUser.id).order("created_at", { ascending: true }),
    ]);

    if (catsRes.error) setMsg(catsRes.error.message);
    else {
      const cats = (catsRes.data ?? []) as Category[];
      setCategories(cats);
      if (!categoryId) {
        const first = cats.find((c) => c.type === txnType) ?? cats[0];
        if (first) setCategoryId(first.id);
      }
    }

    if (listRes.error) setMsg(listRes.error.message);
    else {
      const mappedList = (listRes.data ?? []).map((t: any) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        note: t.note,
        date: t.date,
        category_name: t.category?.name ?? null,
      }));
      setListTxns(mappedList);
    }

    if (monthRes.error) console.error(monthRes.error);
    else {
      const mappedMonth = (monthRes.data ?? []).map((t: any) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        note: t.note,
        date: t.date,
        category_name: t.category?.name ?? null,
      }));
      setMonthTxns(mappedMonth);
      computeStats(mappedMonth);
    }

    if (compareRes.error) console.error(compareRes.error);
    else {
      const mappedCompare = (compareRes.data ?? []).map((t: any) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        note: t.note,
        date: t.date,
        category_name: t.category?.name ?? null,
      }));
      setCompareTxns(mappedCompare);
    }


    if (subRes.error) console.error(subRes.error);
    else setSubscriptions((subRes.data ?? []) as Subscription[]);

    if (goalRes.error) console.error(goalRes.error);
    else setSavingsGoals((goalRes.data ?? []) as SavingsGoal[]);


// --- Depreciation summary (optional; won't crash if table isn't created yet) ---
try {
  // Suggested future table: `assets` (id, user_id, cost, accumulated_depreciation, nbv, created_at, etc.)
  const assetsRes = await supabase
    .from("assets")
    .select("id, nbv, accumulated_depreciation")
    .limit(5000);

  if (!assetsRes.error) {
    const assets = (assetsRes.data ?? []) as any[];
    const assetsCount = assets.length;
    const nbvTotal = assets.reduce((s, a) => s + Number(a.nbv ?? 0), 0);

    // Placeholder until you implement annual depreciation runs:
    const depThisYear = 0;

    setDepSummary({
      assetsCount,
      nbvTotal,
      depThisYear,
      lastRun: null,
    });
  }
} catch {
  // ignore (keeps dashboard stable)
}

    } finally {
      setLastUpdated(new Date());
      setLoading(false);
    }
  }

  function computeStats(list: Txn[]) {
    let inc = 0;
    let exp = 0;
    for (const t of list) {
      if (t.type === "income") inc += t.amount;
      if (t.type === "expense") exp += t.amount;
    }
    setIncomeTotal(inc);
    setExpenseTotal(exp);
  }

  useEffect(() => {
    const relevant = categories.filter((c) => c.type === txnType);
    if (relevant.length > 0) {
        const currentValid = relevant.find(c => c.id === categoryId);
        if(!currentValid) setCategoryId(relevant[0].id);
    }
  }, [txnType, categories]);

  // ---------------- ACTIONS ----------------

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploadingAvatar(true);
    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);

    if (uploadError) {
      alert("Error uploading image: " + uploadError.message);
      setUploadingAvatar(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);

    const { error: updateError } = await supabase.auth.updateUser({
      data: { avatar_url: publicUrl }
    });

    if (updateError) {
      alert("Error updating profile: " + updateError.message);
    } else {
      setAvatarUrl(publicUrl);
    }
    setUploadingAvatar(false);
  }

  // --- SMART SUBSCRIPTION LOGIC ---
  async function logSubscriptions() {
      if(subscriptions.length === 0) return;
      if(!confirm(`Log all ${subscriptions.length} subscriptions as expenses for today?`)) return;

      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if(!user) return;

      // Fallback category
      const defaultCat = categories.find(c => c.name === "Bills" && c.type === "expense") 
                      || categories.find(c => c.type === "expense");

      const payload = subscriptions.map(sub => ({
          user_id: user.id,
          type: "expense",
          amount: sub.amount,
          note: `Subscription: ${sub.name}`,
          date: new Date().toISOString().split("T")[0],
          // Use specific category if assigned, else fallback
          category_id: sub.category_id || defaultCat?.id 
      }));

      const { error } = await supabase.from("transactions").insert(payload);
      
      if(error) alert(error.message);
      else {
          alert("Subscriptions logged successfully!");
          await loadAll(user);
      }
  }

  async function addSubscription() {
    if(!newSubName.trim() || !newSubAmount) return;
    const { data: { user } } = await supabase.auth.getUser();
    if(!user) return;

    const { error } = await supabase.from("subscriptions").insert({
      user_id: user.id,
      name: newSubName,
      amount: Number(newSubAmount),
      category_id: newSubCatId || null // Save selected category
    });
    
    if(error) alert(error.message);
    else {
      setNewSubName("");
      setNewSubAmount("");
      setNewSubCatId("");
      await loadAll(user);
    }
  }

  async function deleteSubscription(id: string) {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.error("getUser error:", error.message);
      return;
    }

    const user = data?.user;
    if (!user) {
      console.warn("No user session. Skipping delete.");
      return;
    }

    const { error: delErr } = await supabase
      .from("subscriptions")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (delErr) {
      console.error("delete subscription error:", delErr.message);
      return;
    }

    await loadAll(user);
  }

  async function addCategory() {
    if (!newCatName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("categories").insert({
        user_id: user.id,
        name: newCatName,
        type: newCatType,
        budget_limit: Number(newCatLimit) || 0
    });

    if (error) alert(error.message);
    else {
        setNewCatName("");
        setNewCatLimit("");
        await loadAll(user);
    }
  }

  async function deleteCategory(id: string) {
    if(!confirm("Are you sure? This might fail if you have transactions linked to this category.")) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if(error) alert("Could not delete. Likely has existing transactions.");
    else if (user) await loadAll(user);
  }

  async function updateBudget(id: string, newLimit: number) {
     const { error } = await supabase.from("categories")
        .update({ budget_limit: newLimit })
        .eq("id", id);
     if (error) alert(error.message);
     const { data: { user } } = await supabase.auth.getUser();
     if(user) await loadAll(user);
  }

  async function addSavingsGoal() {
    if(!newGoalName.trim() || !newGoalTarget) return;
    const { data: { user } } = await supabase.auth.getUser();
    if(!user) return;

    const { error } = await supabase.from("savings_goals").insert({
      user_id: user.id,
      name: newGoalName,
      target_amount: Number(newGoalTarget),
      current_amount: 0
    });

    if(error) alert(error.message);
    else {
      setNewGoalName("");
      setNewGoalTarget("");
      await loadAll(user);
    }
  }

  async function deleteSavingsGoal(id: string) {
    if (!confirm("Delete this savings goal?")) return;

    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.error("getUser error:", error.message);
      return;
    }

    const user = data?.user;
    if (!user) {
      console.warn("No user session. Skipping delete.");
      return;
    }

    const { error: delErr } = await supabase
      .from("savings_goals")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (delErr) {
      console.error("delete savings goal error:", delErr.message);
      return;
    }

    await loadAll(user);
  }

  async function contributeToGoal(id: string, current: number) {
    const add = prompt("Amount to add (or use negative to remove):");
    if(add === null) return;
    const val = Number(add);
    if(isNaN(val)) return;

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("savings_goals")
      .update({ current_amount: current + val })
      .eq("id", id);
    
    if(error) alert(error.message);
    else if(user) await loadAll(user);
  }

  async function seedDefaultCategories() {
    setSeeding(true);
    setMsg("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }

    const defaults = [
      { name: "Bills", type: "expense" as const },
      { name: "Food", type: "expense" as const },
      { name: "Transport", type: "expense" as const },
      { name: "Rent", type: "expense" as const },
      { name: "Health", type: "expense" as const },
      { name: "Entertainment", type: "expense" as const },
      { name: "Salary", type: "income" as const },
      { name: "Business", type: "income" as const },
      { name: "Gift", type: "income" as const },
    ];

    const payload = defaults.map((d) => ({
      user_id: user.id,
      name: d.name,
      type: d.type,
      budget_limit: 0,
    }));

    const res = await supabase
      .from("categories")
      .upsert(payload, { onConflict: "user_id,name,type" });

    if (res.error) setMsg(res.error.message);
    else {
      setMsg("Default categories seeded ✅");
      await loadAll(user);
    }
    setSeeding(false);
  }

  async function saveTransaction() {
    setSaving(true);
    setMsg("");
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setMsg("Enter a valid amount.");
      setSaving(false);
      return;
    }
    if (!categoryId) {
      setMsg("Pick a category.");
      setSaving(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }

    const insertRes = await supabase.from("transactions").insert({
      user_id: user.id,
      type: txnType,
      amount: amt,
      note: note.trim() ? note.trim() : null,
      date,
      category_id: categoryId,
    });

    if (insertRes.error) setMsg(insertRes.error.message);
    else {
      setAmount("");
      setNote("");
      await loadAll(user);
    }
    setSaving(false);
  }

  async function deleteTxn(id: string) {
    setMsg("");
    const { data: { user } } = await supabase.auth.getUser();
    const res = await supabase.from("transactions").delete().eq("id", id);
    if (res.error) setMsg(res.error.message);
    else await loadAll(user);
  }

  async function fetchReportData() {
    if (!reportStart || !reportEnd) return [];
    setExporting(true);
    const { data, error } = await supabase
      .from("transactions")
      .select("date, type, amount, note, category:categories(name)")
      .gte("date", reportStart)
      .lte("date", reportEnd)
      .order("date", { ascending: true });
    
    setExporting(false);

    if (error) {
      alert("Error fetching report: " + error.message);
      return [];
    }
    return data || [];
  }

  async function exportExcel() {
    const data = await fetchReportData();
    if (data.length === 0) {
      alert("No data found for this period.");
      return;
    }

    let csvContent = "Date,Type,Category,Amount,Note\n";
    data.forEach((row: any) => {
      const catName = row.category?.name || "Uncategorized";
      const noteClean = (row.note || "").replace(/,/g, " ");
      csvContent += `${row.date},${row.type},${catName},${row.amount},${noteClean}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `report_${reportStart}_to_${reportEnd}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function exportPDF() {
    const data = await fetchReportData();
    if (data.length === 0) {
      alert("No data found for this period.");
      return;
    }

    let totalInc = 0;
    let totalExp = 0;
    data.forEach((t: any) => {
        if(t.type === 'income') totalInc += t.amount;
        else totalExp += t.amount;
    });

    const htmlContent = `
      <html>
        <head>
          <title>Expense Report</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            h1 { margin-bottom: 5px; }
            .meta { margin-bottom: 20px; color: #555; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
            th { background-color: #f2f2f2; }
            .totals { margin-top: 20px; display: flex; gap: 20px; }
            .box { padding: 10px; border: 1px solid #ddd; border-radius: 8px; }
          </style>
        </head>
        <body>
          <h1>Expense Tracker Report</h1>
          <div class="meta">
            User: ${username} (${email})<br/>
            Period: ${reportStart} to ${reportEnd}
          </div>

          <div class="totals">
            <div class="box"><strong>Total Income:</strong> ${formatMoney(totalInc, currency)}</div>
            <div class="box"><strong>Total Expense:</strong> ${formatMoney(totalExp, currency)}</div>
            <div class="box"><strong>Net Balance:</strong> ${formatMoney(totalInc - totalExp, currency)}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Category</th>
                <th>Note</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${data.map((row: any) => `
                <tr>
                  <td>${row.date}</td>
                  <td style="text-transform:capitalize">${row.type}</td>
                  <td>${row.category?.name || '-'}</td>
                  <td>${row.note || '-'}</td>
                  <td>${formatMoney(row.amount, currency)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    const printWin = window.open("", "_blank", "width=800,height=600");
    if (printWin) {
      printWin.document.write(htmlContent);
      printWin.document.close();
    } else {
      alert("Please allow popups to print report.");
    }
  }

  // ---------------- UI RENDER ----------------

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return listTxns;
    return listTxns.filter((t) => {
      const a = String(t.amount);
      const c = (t.category_name ?? "").toLowerCase();
      const n = (t.note ?? "").toLowerCase();
      const d = (t.date ?? "").toLowerCase();
      const type = t.type.toLowerCase();
      return [a, c, n, d, type].some((x) => x.includes(q));
    });
  }, [listTxns, search]);

  const displayedList = useMemo(() => {
    const q = search.trim();
    if (q) return filteredList; // show all matches when searching
    if (showAllRecent) return filteredList; // toggle to show all
    return filteredList.slice(0, 2); // default: only 2
  }, [filteredList, search, showAllRecent]);

  const balance = incomeTotal - expenseTotal;

  const savingsRate = incomeTotal > 0 ? (balance / incomeTotal) * 100 : 0;
  const runwayMonthsRaw = expenseTotal > 0 ? balance / expenseTotal : 0;


  // ---------------- "What changed since last month" (deltas) ----------------
  const lastMonthStats = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // current month index
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);

    const toISO = (d: Date) => {
      const offset = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - offset).toISOString().split("T")[0];
    };

    const s = toISO(start);
    const e = toISO(end);

    const last = (compareTxns ?? []).filter((t: any) => {
      const d = String(t.date ?? "");
      return d >= s && d <= e;
    });

    let inc = 0;
    let exp = 0;
    for (const t of last) {
      const amt = Number(t.amount ?? 0);
      if (t.type === "income") inc += amt;
      if (t.type === "expense") exp += amt;
    }
    const bal = inc - exp;
    const savings = inc > 0 ? (bal / inc) * 100 : null;
    return { income: inc, expense: exp, balance: bal, savingsRate: savings };
  }, [compareTxns]);

  const deltas = useMemo(() => {
    const incomeChange = incomeTotal - lastMonthStats.income;

    const savingsDelta =
      lastMonthStats.savingsRate == null || incomeTotal <= 0
        ? null
        : savingsRate - lastMonthStats.savingsRate;

    const biggestExpenseChange = (() => {
      const sumByCat = (arr: any[]) => {
        const map = new Map<string, number>();
        for (const t of arr) {
          if (t.type !== "expense") continue;
          const key = String(t.category_name ?? t.category?.name ?? "Uncategorized");
          map.set(key, (map.get(key) ?? 0) + Number(t.amount ?? 0));
        }
        return map;
      };

      const currentMap = sumByCat(monthTxns ?? []);

      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      const toISO = (d: Date) => {
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split("T")[0];
      };
      const s = toISO(start);
      const e = toISO(end);

      const lastTxns = (compareTxns ?? []).filter((t: any) => {
        const d = String(t.date ?? "");
        return d >= s && d <= e && t.type === "expense";
      });
      const lastMap = sumByCat(lastTxns);

      const cats = new Set<string>([...currentMap.keys(), ...lastMap.keys()]);
      let bestCat: string | null = null;
      let bestDelta = 0;

      for (const c of cats) {
        const delta = (currentMap.get(c) ?? 0) - (lastMap.get(c) ?? 0);
        if (bestCat === null || Math.abs(delta) > Math.abs(bestDelta)) {
          bestCat = c;
          bestDelta = delta;
        }
      }

      return bestCat ? { category: bestCat, delta: bestDelta } : { category: "—", delta: 0 };
    })();

    return { incomeChange, savingsDelta, biggestExpenseChange };
  }, [incomeTotal, savingsRate, lastMonthStats, monthTxns, compareTxns]);
  const runwayMonths = Math.max(0, runwayMonthsRaw);
  const runwayDays = Math.max(0, Math.round(runwayMonths * 30));

const monthlyFinance = useMemo(() => {
  // Build month-level totals from the wider comparison window (default: last ~6 months)
  const map = new Map<string, { month: string; income: number; expenses: number }>();

  // compareTxns is already a multi-month window (see compareStart in loadAll)
  for (const t of compareTxns) {
    const month = (t.date || "").slice(0, 7); // YYYY-MM
    if (!month) continue;
    if (!map.has(month)) map.set(month, { month, income: 0, expenses: 0 });

    const entry = map.get(month)!;
    if (t.type === "income") entry.income += Number(t.amount) || 0;
    else entry.expenses += Number(t.amount) || 0;
  }

  return Array.from(map.values()).sort((a, b) => (a.month > b.month ? 1 : -1));
}, [compareTxns]);

const financialHealth = useMemo(() => {
  return calculateFinancialHealth(
    monthlyFinance.map((m) => ({ month: m.month, income: m.income, expenses: m.expenses }))
  );
}, [monthlyFinance]);


  if (loading && !email) {
    return (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--muted)" }}>
            Connecting...
        </div>
    );
  }

  return (
    <main style={{ padding: "42px 0 calc(var(--floating-bar-space) + env(safe-area-inset-bottom)) 0" }}>
      <div className="container stack-24">
        <div className="row-between">
          <div>
            <h1 style={{ margin: 0, fontSize: 44, letterSpacing: "-0.03em", fontWeight: 900 }}>
              Dashboard
            </h1>
            <div style={{ marginTop: 6, color: "var(--muted)" }}>
              Overview for {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12 }}>
              Last updated: {lastUpdated ? formatLastUpdated(lastUpdated) : "—"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              className="btn btn-ghost"
              title="AI Insight (Ctrl/Cmd + K)"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => runAiSummary(true)}
              type="button"
            >
              ✨
            </button>
            <button className="btn btn-ghost" onClick={logout}>
            Log out
          </button>
          </div>
        </div>


        {msg ? (
          <div className="card card-pad" style={{ padding: 14, whiteSpace: "pre-wrap" }}>
            {msg}
          </div>
        ) : null}

        {loading ? (
          <div className="stats-grid" aria-label="Loading summary cards">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card card-pad">
                <div className="skeleton-line w-40" />
                <div className="skeleton-line w-70" style={{ marginTop: 10, height: 28 }} />
                <div className="skeleton-line w-55" style={{ marginTop: 10 }} />
              </div>
            ))}
          </div>
        ) : (
<div className="stats-grid">
          <div className="card card-pad">
            <div className="stat-label">INCOME (THIS MONTH)</div>
            <div className="stat-value">{formatMoney(incomeTotal, currency)}</div>
          </div>
          <div className="card card-pad">
            <div className="stat-label">EXPENSES (THIS MONTH)</div>
            <div className="stat-value">{formatMoney(expenseTotal, currency)}</div>
          </div>
          <div className="card card-pad">
            <div className="stat-label">BALANCE (THIS MONTH)</div>
            <div className="stat-value">{formatMoney(balance, currency)}</div>
          </div>

          <div className="card card-pad">
            <div className="stat-label">SAVINGS RATE</div>
            <div className="stat-value">
              {incomeTotal > 0 ? `${savingsRate.toFixed(1)}%` : "—"}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
              Balance ÷ Income
            </div>
          </div>

          <div className="card card-pad">
            <div className="stat-label">RUNWAY</div>
            <div className="stat-value">
              {expenseTotal > 0 ? `${runwayMonths.toFixed(2)} mo` : "—"}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
              ≈ {expenseTotal > 0 ? `${runwayDays} days` : "—"} at current spend
            </div>
          </div>
<div
  className="card card-pad"
  style={{ cursor: "pointer" }}
  onClick={() => {
    hapticLight();
    router.push("/depreciation");
  }}
  title="Depreciation"
>
  <div className="stat-label">DEPRECIATION</div>

  <div className="stat-value" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <div style={{ fontSize: 18, fontWeight: 800 }}>
      NBV: {formatMoney(depSummary.nbvTotal, currency)}
    </div>

    <div style={{ color: "var(--muted)", fontSize: 13 }}>
      Assets: <strong>{depSummary.assetsCount}</strong> • This year:{" "}
      <strong>{formatMoney(depSummary.depThisYear, currency)}</strong>
    </div>

    <div style={{ color: "var(--muted)", fontSize: 12 }}>
      {depSummary.lastRun ? `Last run: ${depSummary.lastRun}` : "Tap to record assets"}
    </div>
  </div>
</div>

        </div>
        )}

{financialHealth ? (
  <div className="card card-pad fh-card" style={{ padding: 22, borderRadius: 24 }}>
    <div className="row-between fh-row" style={{ alignItems: "flex-start", gap: 16 }}>
      <div className="fh-main" style={{ flex: 1, minWidth: 240 }}>
        <div className="stat-label">FINANCIAL HEALTH</div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 6 }}>
          <div style={{ fontSize: 48, fontWeight: 950, letterSpacing: "-0.03em" }}>
            {financialHealth.score}
          </div>
          <div style={{ fontSize: 18, color: "var(--muted)", marginBottom: 6 }}>/100</div>

          {financialHealth.deltaFromPreviousMonth !== null && (
            <div
              style={{
                marginLeft: 6,
                fontSize: 12,
                fontWeight: 900,
                color:
                  financialHealth.deltaFromPreviousMonth >= 0
                    ? "var(--primary)"
                    : "var(--danger, #ff6b6b)",
              }}
            >
              {financialHealth.deltaFromPreviousMonth >= 0 ? "▲" : "▼"}{" "}
              {Math.abs(financialHealth.deltaFromPreviousMonth)}
            </div>
          )}
        </div>

        <div style={{ color: "var(--muted)", marginTop: 8 }}>
          {financialHealth.insight.headline}
        </div>

        <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <span className="pill">Income vs Expenses: {financialHealth.breakdown.incomeVsExpenses}</span>
          <span className="pill">Savings: {financialHealth.breakdown.savingsRate}</span>
          <span className="pill">Consistency: {financialHealth.breakdown.spendingConsistency}</span>
          <span className="pill">Volatility: {financialHealth.breakdown.volatility}</span>
        </div>
      </div>

      <div className="fh-side" style={{ width: 220, flexShrink: 0 }}>
        <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8 }}>Progress</div>
        <div style={{ height: 10, width: "100%", borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${financialHealth.score}%`,
              borderRadius: 999,
              background: "linear-gradient(90deg, rgba(0,224,255,0.9), rgba(160,32,240,0.9))",
            }}
          />
        </div>
        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 10 }}>
          {financialHealth.insight.summary}
        </div>
      </div>
    </div>
  </div>
) : null}
          <div className="card card-pad" style={{ gridColumn: "1 / -1", marginTop: 18 }}>
            <div className="stat-label">WHAT CHANGED SINCE LAST MONTH</div>

            <div className="delta-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, marginTop: 10 }}>
              <div>
                <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Biggest expense change</div>
                <div style={{ fontWeight: 900 }}>{deltas.biggestExpenseChange.category}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)" }}>
                  {deltas.biggestExpenseChange.delta === 0
                    ? "No change"
                    : `${deltas.biggestExpenseChange.delta > 0 ? "▲" : "▼"} ${formatMoney(
                        Math.abs(deltas.biggestExpenseChange.delta),
                        currency
                      )}`}
                </div>
              </div>

              <div>
                <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Income change</div>
                <div style={{ fontWeight: 900 }}>
                  {deltas.incomeChange === 0
                    ? "No change"
                    : `${deltas.incomeChange > 0 ? "▲" : "▼"} ${formatMoney(
                        Math.abs(deltas.incomeChange),
                        currency
                      )}`}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)" }}>vs last month</div>
              </div>

              <div>
                <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Savings delta</div>
                <div style={{ fontWeight: 900 }}>
                  {deltas.savingsDelta == null
                    ? "—"
                    : `${deltas.savingsDelta >= 0 ? "▲" : "▼"} ${Math.abs(deltas.savingsDelta).toFixed(1)}%`}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)" }}>savings rate</div>
              </div>
            </div>

            <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 12 }}>
              Based on your current month vs last month totals.
            </div>
          </div>
        <div className="grid-2">
            {/* 1. TREND CHART (Left) */}
            <section className="card card-pad">
                <div className="row-between" style={{ marginBottom: 20 }}>
                    <div>
                        <h2 className="card-title">Monthly Trend</h2>
                        <p className="card-subtitle">Income vs Expense.</p>
                    </div>
                </div>
                
                <div style={{ width: "100%", height: 300 }}>
                    {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                                data={chartData}
                                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                            >
                                <defs>
                                    <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#00E0FF" stopOpacity={0.4}/>
                                        <stop offset="95%" stopColor="#00E0FF" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#A020F0" stopOpacity={0.4}/>
                                        <stop offset="95%" stopColor="#A020F0" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                                <XAxis 
                                    dataKey="date" 
                                    stroke="var(--muted)" 
                                    fontSize={12} 
                                    tickLine={false} 
                                    axisLine={false}
                                    minTickGap={30}
                                    tickFormatter={(str) => str.slice(5)}
                                />
                                <YAxis 
                                    stroke="var(--muted)" 
                                    fontSize={12} 
                                    tickLine={false} 
                                    axisLine={false}
                                    tickFormatter={(val) => `${val / 1000}k`}
                                />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: "rgba(10, 14, 20, 0.8)", 
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: "12px",
                                        backdropFilter: "blur(12px)"
                                    }}
                                    itemStyle={{ color: "#fff" }}
                                    labelStyle={{ color: "var(--muted)", marginBottom: "4px" }}
                                />
                                <Area type="monotone" dataKey="income" stroke="#00E0FF" fillOpacity={1} fill="url(#colorInc)" strokeWidth={3} />
                                <Area type="monotone" dataKey="expense" stroke="#A020F0" fillOpacity={1} fill="url(#colorExp)" strokeWidth={3} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--muted)" }}>
                            No data this month.
                        </div>
                    )}
                </div>
            </section>

            {/* 2. PIE CHART (Right) */}
            <section className="card card-pad">
                <div className="row-between" style={{ marginBottom: 20 }}>
                    <div>
                        <h2 className="card-title">Breakdown</h2>
                        <p className="card-subtitle">Where your money goes.</p>
                    </div>
                </div>

                <div style={{ width: "100%", height: 300 }}>
                    {pieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                             <PieChart>
                                <Pie
                                    data={pieData}
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="rgba(0,0,0,0)" />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: "rgba(10, 14, 20, 0.8)", 
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        borderRadius: "12px",
                                        backdropFilter: "blur(12px)"
                                    }}
                                    itemStyle={{ color: "#fff" }}
                                    formatter={(value: any) => formatMoney(Number(value ?? 0), currency)}

                                />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--muted)" }}>
                            Add expenses to see breakdown.
                        </div>
                    )}
                </div>
            </section>
        </div>

        <div className="grid-2">
            {/* Subscriptions - UPDATED WITH CATEGORY SELECTION */}
            <section className="card card-pad">
                <div className="row-between">
                    <div>
                        <h2 className="card-title">Subscriptions</h2>
                        <p className="card-subtitle">Monthly: {formatMoney(subscriptionTotal, currency)}</p>
                    </div>
                    {subscriptions.length > 0 && (
                        <button className="btn btn-ghost" onClick={logSubscriptions} style={{ fontSize: 11, border: "1px solid var(--border)" }}>
                            Log to Expenses
                        </button>
                    )}
                </div>
                <div className="stack-16" style={{ marginTop: 16 }}>
                    {subscriptions.map(sub => (
                        <div key={sub.id} className="row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                            <div style={{ fontWeight: 600 }}>
                                {sub.name}
                                {sub.category && (
                                  <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 6, background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4 }}>
                                    {sub.category.name}
                                  </span>
                                )}
                            </div>
                            <div className="row">
                                <div style={{ fontSize: 13, color: "var(--muted)" }}>{formatMoney(sub.amount, currency)}</div>
                                <button className="btn btn-ghost" style={{ color: "#ff6b6b", fontSize: 18, padding: "0 8px" }} onClick={() => deleteSubscription(sub.id)}>×</button>
                            </div>
                        </div>
                    ))}
                    <div className="row">
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 3, gap: 4 }}>
                           <input className="input" placeholder="Name (e.g. Netflix)" value={newSubName} onChange={e => setNewSubName(e.target.value)} />
                           <select className="input" value={newSubCatId} onChange={e => setNewSubCatId(e.target.value)} style={{ fontSize: 12 }}>
                             <option value="">(Select Category)</option>
                             {categories.filter(c => c.type === 'expense').map(c => (
                               <option key={c.id} value={c.id}>{c.name}</option>
                             ))}
                           </select>
                        </div>
                        <input className="input" type="number" placeholder="Amt" value={newSubAmount} onChange={e => setNewSubAmount(e.target.value)} style={{ flex: 1, alignSelf: 'flex-start' }} />
                        <button className="btn btn-ghost" onClick={addSubscription} style={{ alignSelf: 'flex-start', marginTop: 8 }}>+</button>
                    </div>
                </div>
            </section>

            {/* Savings Goals */}
            <section className="card card-pad">
                 <div className="row-between">
                    <div>
                        <h2 className="card-title">Savings Goals</h2>
                        <p className="card-subtitle">Track your targets</p>
                    </div>
                </div>
                <div className="stack-16" style={{ marginTop: 16 }}>
                    {savingsGoals.map(goal => {
                        const pct = Math.min(100, Math.max(0, (goal.current_amount / goal.target_amount) * 100));
                        return (
                            <div key={goal.id} style={{ marginBottom: 12 }}>
                                <div className="row-between" style={{ marginBottom: 4 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{goal.name}</div>
                                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                                        {formatMoney(goal.current_amount, currency)} / {formatMoney(goal.target_amount, currency)}
                                    </div>
                                </div>
                                <div style={{ height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden", position: 'relative' }}>
                                    <div style={{ width: `${pct}%`, background: pct >= 100 ? "#4caf50" : "#00E0FF", height: "100%" }} />
                                </div>
                                <div className="row" style={{ marginTop: 4, justifyContent: "flex-end", gap: 8 }}>
                                    <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => contributeToGoal(goal.id, goal.current_amount)}>+ Add funds</button>
                                    <button className="btn btn-ghost" style={{ fontSize: 10, color: "#ff6b6b" }} onClick={() => deleteSavingsGoal(goal.id)}>Delete</button>
                                </div>
                            </div>
                        )
                    })}
                     <div className="row" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                        <input className="input" placeholder="Goal (e.g. Car)" value={newGoalName} onChange={e => setNewGoalName(e.target.value)} style={{ flex: 2 }} />
                        <input className="input" type="number" placeholder="Target" value={newGoalTarget} onChange={e => setNewGoalTarget(e.target.value)} style={{ flex: 1 }} />
                        <button className="btn btn-ghost" onClick={addSavingsGoal}>+</button>
                    </div>
                </div>
            </section>
        </div>

        <div className="grid-2">
          {/* Add transaction */}
          <section className="card card-pad">
            <div className="row-between">
              <div>
                <h2 className="card-title">Add transaction</h2>
                <p className="card-subtitle">Log income & expenses.</p>
              </div>

              <div className="seg" aria-label="Type">
                <button
                  className={txnType === "expense" ? "active" : ""}
                  onClick={() => setTxnType("expense")}
                  type="button"
                >
                  Expense
                </button>
                <button
                  className={txnType === "income" ? "active" : ""}
                  onClick={() => setTxnType("income")}
                  type="button"
                >
                  Income
                </button>
              </div>
            </div>

            <div className="stack-16">
              <div className="row" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                    Amount
                  </div>
                  <input
                    className="input"
                    placeholder="e.g. 5000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                    Category
                  </div>
                  <select
                    className="input"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    {categories
                      .filter((c) => c.type === txnType)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Budget Warning */}
              {budgetStatus && (
                <div style={{ 
                    fontSize: 12, 
                    padding: "8px 12px", 
                    borderRadius: 8,
                    background: budgetStatus.isOver ? "rgba(255, 50, 50, 0.1)" : "rgba(255, 255, 255, 0.05)",
                    border: budgetStatus.isOver ? "1px solid rgba(255, 50, 50, 0.3)" : "1px solid transparent",
                    color: budgetStatus.isOver ? "#ff6b6b" : "var(--muted)"
                }}>
                    <div className="row-between">
                       <span>Spend: {formatMoney(budgetStatus.spent, currency)}</span>
                       <span>Limit: {formatMoney(budgetStatus.limit, currency)}</span>
                    </div>
                    {budgetStatus.isOver && (
                        <div style={{ marginTop: 4, fontWeight: "bold" }}>
                            ⚠️ Exceeding budget by {formatMoney(budgetStatus.totalAfter - budgetStatus.limit, currency)}!
                        </div>
                    )}
                </div>
              )}

              <div className="row" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                    Date
                  </div>
                  <input
                    className="input"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                    Note (optional)
                  </div>
                  <input
                    className="input"
                    placeholder="e.g. Uber / Lunch"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>

              <button className="btn btn-primary" onClick={saveTransaction} disabled={saving}>
                {saving ? "Saving..." : "Save transaction"}
              </button>
            </div>
          </section>

          {/* Latest transactions (List View) */}
          <section className="card card-pad">
            <div className="row-between">
              <div>
                <h2 className="card-title">Recent Activity</h2>
                <p className="card-subtitle">
                  {search.trim()
                    ? `Search results (${displayedList.length})`
                    : showAllRecent
                      ? `Showing all (${filteredList.length})`
                      : "Showing 2 of last 50"}
                </p>
              </div>
            </div>

            <div className="stack-16">
              <input
                className="input"
                placeholder="Search history..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              {loading ? (
                <div style={{ color: "var(--muted)" }}>Loading…</div>
              ) : displayedList.length === 0 ? (
                <div style={{ color: "var(--muted)" }}>No transactions found.</div>
              ) : (
                <div 
                  className="stack-16" 
                  style={{ 
                    maxHeight: "320px", 
                    overflowY: "auto", 
                    paddingRight: "8px" 
                  }}
                >
                                    {!search.trim() && filteredList.length > 2 && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setShowAllRecent((v) => !v)}
                        style={{ padding: "8px 12px", borderRadius: 10 }}
                      >
                        {showAllRecent ? "Show less" : `View all (${filteredList.length})`}
                      </button>
                    </div>
                  )}

{displayedList.map((t) => {
                    const isExpense = t.type === "expense";
                    const signedAmount = isExpense ? -Math.abs(t.amount) : Math.abs(t.amount);

                    return (
                      <div
                        key={t.id}
                        className="card"
                        style={{ padding: 14, borderRadius: 18 }}
                      >
                        <div className="row-between">
                          <div>
                            <div style={{ fontWeight: 850 }}>
                              {t.type === "income" ? "Income" : "Expense"} •{" "}
                              {t.category_name ?? "—"}
                            </div>
                            <div style={{ color: "var(--muted)", fontSize: 12 }}>
                              {t.date}
                              {t.note ? ` • ${t.note}` : ""}
                            </div>
                          </div>

                          <div className="row">
                            <div style={{ fontWeight: 900 }}>
                              {formatMoney(signedAmount, currency)}
                            </div>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: "10px 14px" }}
                              onClick={() => deleteTxn(t.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <div className="floating-bar desktop-bar">
        <div className="user-chip" role="button" onClick={() => setSettingsOpen(true)}>
          {avatarUrl ? (
             <img src={avatarUrl} alt="Me" className="avatar" style={{ objectFit: 'cover' }} />
          ) : (
             <div className="avatar">{initials}</div>
          )}
          <div className="user-meta">
            <div className="name">{username}</div>
            <div className="email">{email || "—"}</div>
          </div>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <div className="seg" aria-label="Theme">
            <button className={themeMode === "system" ? "active" : ""} onClick={() => setThemeMode("system")}>Auto</button>
            <button className={themeMode === "dark" ? "active" : ""} onClick={() => setThemeMode("dark")}>Dark</button>
            <button className={themeMode === "light" ? "active" : ""} onClick={() => setThemeMode("light")}>Light</button>
          </div>

          <div className="seg" aria-label="Currency">
            <button className={currency === "TZS" ? "active" : ""} onClick={() => setCurrency("TZS")}>TZS</button>
            <button className={currency === "USD" ? "active" : ""} onClick={() => setCurrency("USD")}>USD</button>
          </div>

          <button className="btn btn-ghost" onClick={() => setSettingsOpen(true)} title="Settings">
            ⚙
          </button>
        </div>

      <div className="mobile-bar">
        <button
          type="button"
          className="mobile-user"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open profile and settings"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Me" className="avatar" style={{ objectFit: "cover" }} />
          ) : (
            <div className="avatar">{initials}</div>
          )}
          <div className="mobile-username">{username}</div>
        </button>

        <div className="seg mobile-seg" aria-label="Currency">
          <button className={currency === "TZS" ? "active" : ""} onClick={() => setCurrency("TZS")}>
            TZS
          </button>
          <button className={currency === "USD" ? "active" : ""} onClick={() => setCurrency("USD")}>
            USD
          </button>
        </div>

        <button
          type="button"
          className="btn btn-ghost mobile-gear"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Settings"
        >
          ⚙
        </button>
      </div>

      </div>

      {settingsOpen ? (
        <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div
            className="card card-pad settings-card modal-card ai-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div className="row-between" style={{ marginBottom: 16 }}>
              <div className="seg">
                  <button className={settingsTab === "general" ? "active" : ""} onClick={() => setSettingsTab("general")}>General</button>
                  <button className={settingsTab === "categories" ? "active" : ""} onClick={() => setSettingsTab("categories")}>Categories</button>
              </div>
              <button className="btn btn-ghost" onClick={() => setSettingsOpen(false)}>
                Close
              </button>
            </div>

            {settingsTab === "general" && (
                <div className="stack-24" style={{ marginTop: 8 }}>
                    <div className="card" style={{ padding: 16, borderRadius: 18, textAlign: 'center' }}>
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                            {avatarUrl ? (
                                <img src={avatarUrl} style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--primary)', color: '#fff', fontSize: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials}</div>
                            )}
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                style={{ position: 'absolute', bottom: 0, right: 0, background: '#fff', color: '#000', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', border: '1px solid #ddd' }}
                            >+</div>
                        </div>
                        <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleAvatarUpload} />
                        <div style={{ marginTop: 8, fontWeight: 900 }}>{username}</div>
                        <div style={{ color: "var(--muted)", fontSize: 13 }}>{uploadingAvatar ? "Uploading..." : "Tap + to change photo"}</div>
                    </div>

                    <div className="card" style={{ padding: 16, borderRadius: 18, border: "1px solid var(--primary)" }}>
                        <div className="stat-label" style={{ color: "var(--primary)" }}>Reports & Export</div>
                        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
                        Select a date range to download your data.
                        </p>
                        
                        <div className="stack-16">
                            <div className="row">
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: 11, color: "var(--muted)" }}>From</label>
                                    <input 
                                        type="date" 
                                        className="input" 
                                        value={reportStart} 
                                        onChange={(e) => setReportStart(e.target.value)} 
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: 11, color: "var(--muted)" }}>To</label>
                                    <input 
                                        type="date" 
                                        className="input" 
                                        value={reportEnd} 
                                        onChange={(e) => setReportEnd(e.target.value)} 
                                    />
                                </div>
                            </div>

                            <div className="row">
                                <button 
                                    className="btn btn-ghost" 
                                    style={{ flex: 1, justifyContent: "center", border: "1px solid var(--border)" }}
                                    onClick={exportExcel}
                                    disabled={exporting}
                                >
                                    {exporting ? "..." : "Download Excel (CSV)"}
                                </button>
                                <button 
                                    className="btn btn-ghost" 
                                    style={{ flex: 1, justifyContent: "center", border: "1px solid var(--border)" }}
                                    onClick={exportPDF}
                                    disabled={exporting}
                                >
                                    {exporting ? "..." : "Print / PDF"}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="card" style={{ padding: 16, borderRadius: 18 }}>
                        <div className="stat-label">System</div>
                        <div className="row" style={{ marginTop: 10, flexWrap: "wrap", gap: 10 }}>
                            <button className="btn btn-ghost" onClick={() => setSearch("")}>
                                Clear search
                            </button>
                            <button className="btn btn-ghost" onClick={() => {
                                supabase.auth.getUser().then(({data}) => loadAll(data.user));
                            }}>
                                Refresh data
                            </button>
                             <button className="btn btn-ghost" onClick={seedDefaultCategories} disabled={seeding}>
                                {seeding ? "..." : "Reset Categories"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {settingsTab === "categories" && (
                <div className="stack-24" style={{ marginTop: 8 }}>
                     <div className="card" style={{ padding: 16, borderRadius: 18, border: "1px dashed var(--border)" }}>
                         <div className="stat-label">Add New Category</div>
                         <div className="stack-16" style={{ marginTop: 10 }}>
                            <div className="row">
                                <input className="input" placeholder="Name" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
                                <select className="input" value={newCatType} onChange={(e) => setNewCatType(e.target.value as TxnType)} style={{ width: 100 }}>
                                    <option value="expense">Exp</option>
                                    <option value="income">Inc</option>
                                </select>
                            </div>
                            <div className="row">
                                <input className="input" type="number" placeholder="Budget Limit (Optional)" value={newCatLimit} onChange={e => setNewCatLimit(e.target.value)} />
                                <button className="btn btn-primary" onClick={addCategory} style={{ width: 'auto' }}>Add</button>
                            </div>
                         </div>
                     </div>

                     <div className="stack-16">
                         {categories.map(c => (
                             <div key={c.id} className="card" style={{ padding: 12, borderRadius: 12 }}>
                                 <div className="row-between">
                                     <div>
                                         <div style={{ fontWeight: 600 }}>{c.name} <span style={{ fontSize: 10, color: "var(--muted)", textTransform: 'uppercase', background: 'var(--card-bg)', padding: '2px 6px', borderRadius: 4 }}>{c.type}</span></div>
                                         <div style={{ fontSize: 12, color: "var(--muted)" }}>
                                            {c.type === 'expense' ? `Budget: ${c.budget_limit ? formatMoney(c.budget_limit, currency) : 'None'}` : 'Income Source'}
                                         </div>
                                     </div>
                                     <div className="row">
                                         {c.type === 'expense' && (
                                            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => {
                                                const newL = prompt("New budget limit:", String(c.budget_limit || 0));
                                                if(newL !== null) updateBudget(c.id, Number(newL));
                                            }}>Edit Budget</button>
                                         )}
                                         <button className="btn btn-ghost" style={{ color: '#ff6b6b' }} onClick={() => deleteCategory(c.id)}>×</button>
                                     </div>
                                 </div>
                             </div>
                         ))}
                     </div>
                </div>
            )}

            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 24 }}>
                App Version: 2.3 • Theme: {themeMode}
            </div>
            </div>
          </div>
      ) : null}

      {/* Mobile fix: prevent the floating bar from overlapping content (keeps desktop unchanged) */}
      
      {/* AI Assistant Modal */}
      {aiOpen && (
        <div
          className="modal-overlay ai-modal-overlay"
          onClick={() => {
              setAiOpen(false);
          }}
        >
          <div
            className="card card-pad settings-card modal-card ai-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="AI insight"
          >
            <div className="ai-modal-header">
              <div>
                <div className="ai-modal-title">AI Insight</div>
                <div className="ai-compare-toggle" role="tablist" aria-label="Monthly comparison mode">
                  {[
                    { key: "this", label: "This month" },
                    { key: "last", label: "Last month" },
                    { key: "avg3", label: "3-month avg" },
                  ].map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      className={`ai-compare-pill ${compareMode === (t.key as any) ? "active" : ""}`}
                      onClick={() => setCompareMode(t.key as any)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="btn btn-ghost ai-modal-close"
                type="button"
                aria-label="Close"
                onClick={() => {
                          setAiOpen(false);
                }}
              >
                ✕
              </button>
            </div>

            <div className="ai-modal-body">
              {aiLoading ? (
                <div className="ai-skeleton" aria-label="Loading">
                  <div className="ai-skeleton-line" />
                  <div className="ai-skeleton-line" />
                  <div className="ai-skeleton-line short" />
                </div>
              ) : (
                <div className="ai-modal-text">
                  {aiResponse ? renderAiText(aiResponse) : "Tap Generate to get a summary."}
                </div>
              )}
            </div>

            {/* Follow-up chat (small but 🔥) */}
            <FollowUpChat
              context={aiContext}
              disabled={aiLoading}
              storageKey={`ai_followup_${aiContext?.month || "current"}`}
                          onLastUpdated={(d) => setLastUpdated(d)}
            />

            <div className="ai-modal-actions">
              <button
                className="btn btn-ghost ai-copy-btn" title="Copy insight"
                type="button"
                disabled={!aiResponse || aiLoading}
                onClick={() => copyAiResponse()}
              >
                {aiCopied ? "Copied" : "Copy"}
              </button>

              <button
                className="btn btn-primary ai-generate-btn" title="Generate / Regenerate"
                type="button"
                disabled={aiLoading}
                onClick={() => runAiSummary(false)}
              >
                {aiLoading ? "Generating…" : aiResponse ? "Regenerate" : "Generate insight"}
              </button>
            </div>
          </div>
        </div>
      )}

<style jsx global>{`

/* What changed since last month card */
@media (max-width: 640px) {
  .delta-grid {
    grid-template-columns: 1fr !important;
    gap: 12px !important;
  }
}


        :root {
          --floating-bar-space: 120px;
        }

        .mobile-bar { display: none; }

        @media (max-width: 640px) {
          :root {
            --floating-bar-space: 120px;
          }

          .desktop-bar { display: none !important; }
          .mobile-bar {
            position: fixed;
            left: 12px;
            right: 12px;
            bottom: calc(12px + env(safe-area-inset-bottom));
            z-index: 80;
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px;
            border-radius: 22px;
            background: rgba(0,0,0,0.55);
            border: 1px solid rgba(255,255,255,0.12);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
          }

          .mobile-bar .mobile-user {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
            flex: 1 1 auto;
            padding: 6px 10px;
            border-radius: 999px;
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.10);
          }

          .mobile-bar .mobile-username {
            font-weight: 900;
            font-size: 13px;
            color: rgba(255,255,255,0.92);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .mobile-bar .mobile-seg { flex: 0 0 auto; }
          .mobile-bar .mobile-gear { padding: 10px 12px; border-radius: 14px; }


          .floating-bar {
            left: 12px !important;
            right: 12px !important;
            bottom: calc(12px + env(safe-area-inset-bottom)) !important;
            flex-wrap: wrap !important;
            gap: 10px !important;
            padding: 10px !important;
          }

          .floating-bar .user-chip {
            flex: 1 1 100% !important;
            min-width: 0;
          }

          .floating-bar .row {
            width: 100% !important;
            justify-content: space-between !important;
          }

          .floating-bar .seg {
            flex: 1 1 auto;
          }

          .floating-bar .user-meta .email {
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        }
      


.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  color: rgba(255,255,255,0.85);
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10);
  backdrop-filter: blur(8px);
}

/* Financial Health mobile layout */
@media (max-width: 640px) {
  .fh-card { padding: 18px !important; }
  .fh-row { flex-direction: column !important; }
  .fh-main { min-width: 0 !important; }
  .fh-side { width: 100% !important; }
  .fh-card .stat-label { letter-spacing: 0.12em; }
  .fh-card .pill { font-size: 11px; padding: 6px 9px; }
}

/* Light theme pills (Financial Health breakdown + chips) */
html[data-theme="light"] .pill,
body[data-theme="light"] .pill,
:root[data-theme="light"] .pill,
html.light .pill,
body.light .pill,
:root.light .pill {
  color: rgba(0,0,0,0.78);
  background: rgba(0,0,0,0.05);
  border: 1px solid rgba(0,0,0,0.10);
}


/* -------- Skeleton loaders (subtle) -------- */
.skeleton-line {
  height: 12px;
  border-radius: 999px;
  background: rgba(255,255,255,0.10);
  overflow: hidden;
  position: relative;
}
.skeleton-line::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-60%);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
  animation: shimmer 1.2s infinite;
}
@keyframes shimmer {
  0% { transform: translateX(-60%); }
  100% { transform: translateX(60%); }
}
.w-40 { width: 40%; }
.w-55 { width: 55%; }
.w-70 { width: 70%; }

@media (prefers-reduced-motion: reduce) {
  .skeleton-line::after { animation: none; }
}


        /* -------- AI Follow-up Chat -------- */
        .ai-followup {
          margin-top: 12px;
        }

        .ai-followup-toggle {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          text-decoration: underline;
          text-underline-offset: 4px;
          opacity: 0.9;
        }

        .ai-followup-toggle:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .ai-followup-card {
          margin-top: 10px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 18px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .ai-followup-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 10px;
        }

        .ai-chip {
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(255, 255, 255, 0.9);
          transition: opacity 120ms ease;
        }

        .ai-chip:hover {
          opacity: 0.85;
        }

        .ai-chip:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .ai-followup-thread {
          max-height: 220px;
          overflow: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-right: 4px;
          margin-bottom: 10px;
        }

        .ai-bubble {
          font-size: 13px;
          line-height: 1.35;
          padding: 10px 12px;
          border-radius: 16px;
          white-space: pre-wrap;
        }

        .ai-bubble.user {
          align-self: flex-end;
          background: #111;
          color: #fff;
          max-width: 88%;
        }

        .ai-bubble.assistant {
          align-self: flex-start;
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(0, 0, 0, 0.08);
          color: #111;
          max-width: 88%;
        }

        .ai-followup-inputrow {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .ai-followup-input {
          flex: 1;
          border-radius: 14px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          padding: 10px 12px;
          font-size: 13px;
          background: rgba(255, 255, 255, 0.9);
          outline: none;
        }

        .ai-followup-input:focus {
          box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.08);
        }

        .ai-followup-send {
          border-radius: 14px;
          padding-left: 14px;
          padding-right: 14px;
          white-space: nowrap;
        }

        .ai-followup-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 8px;
        }

        .ai-followup-tip {
          font-size: 12px;
          opacity: 0.7;
        }

        .ai-followup-clear {
          font-size: 12px;
          text-decoration: underline;
          text-underline-offset: 4px;
          opacity: 0.8;
        }

        .ai-followup-clear:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }


        /* AI compare toggle pills */
        .ai-compare-toggle {
          display: flex;
          gap: 8px;
          margin-top: 10px;
          flex-wrap: wrap;
        }

        .ai-compare-pill {
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          line-height: 1;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.85);
          transition: background 150ms ease, color 150ms ease, border-color 150ms ease, transform 150ms ease;
        }
        .ai-compare-pill:hover {
          background: rgba(255,255,255,0.10);
          transform: translateY(-1px);
        }
        .ai-compare-pill.active {
          background: rgba(255,255,255,0.90);
          color: rgba(0,0,0,0.90);
          border-color: rgba(255,255,255,0.90);
        }

        /* Light theme */
        html[data-theme="light"] .ai-compare-pill,
        body[data-theme="light"] .ai-compare-pill,
        :root[data-theme="light"] .ai-compare-pill,
        html.light .ai-compare-pill,
        body.light .ai-compare-pill,
        :root.light .ai-compare-pill {
          border-color: rgba(0,0,0,0.12);
          background: rgba(0,0,0,0.04);
          color: rgba(0,0,0,0.78);
        }
        html[data-theme="light"] .ai-compare-pill:hover,
        body[data-theme="light"] .ai-compare-pill:hover,
        :root[data-theme="light"] .ai-compare-pill:hover,
        html.light .ai-compare-pill:hover,
        body.light .ai-compare-pill:hover,
        :root.light .ai-compare-pill:hover {
          background: rgba(0,0,0,0.06);
        }
        html[data-theme="light"] .ai-compare-pill.active,
        body[data-theme="light"] .ai-compare-pill.active,
        :root[data-theme="light"] .ai-compare-pill.active,
        html.light .ai-compare-pill.active,
        body.light .ai-compare-pill.active,
        :root.light .ai-compare-pill.active {
          background: rgba(0,0,0,0.86);
          color: rgba(255,255,255,0.96);
          border-color: rgba(0,0,0,0.86);
        }

`}</style>
    </main>
  );
}