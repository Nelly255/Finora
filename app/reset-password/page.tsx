"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendResetLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setMsg("Please enter your email.");
      return;
    }

    setLoading(true);

    // Where Supabase should redirect after the user clicks the email link.
    // If you already have a dedicated route, change this.
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/update-password`
        : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo,
    });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("Reset link sent. Check your inbox (and spam).");
  }

  return (
    <main className="auth-shell">
      <div className="auth-card card card-pad">
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: "-0.02em" }}>
          Reset password
        </h1>
        <p style={{ marginTop: 8, marginBottom: 18, color: "var(--muted)" }}>
          Enter your email to receive a reset link.
        </p>

        {msg ? (
          <div className="card" style={{ padding: 12, borderRadius: 16, marginBottom: 14 }}>
            {msg}
          </div>
        ) : null}

        <form onSubmit={sendResetLink} className="stack-16">
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>

        <div className="row-between" style={{ marginTop: 14 }}>
          <Link href="/login">Log in</Link>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => router.push("/")}
            style={{ padding: "10px 14px" }}
          >
            Home
          </button>
        </div>
      </div>
    </main>
  );
}
