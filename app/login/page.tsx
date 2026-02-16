"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function loginWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    router.push("/dashboard");
  }

  async function loginWithGoogle() {
    setMsg("");
    setLoading(true);

    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

    // ✅ PKCE-friendly: redirect back to an app callback route that finalizes the session
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (error) setMsg(error.message);
  }

  return (
    <main className="auth-shell">
      <div className="auth-card card card-pad">
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, letterSpacing: "-0.02em" }}>
          Welcome back
        </h1>
        <p style={{ marginTop: 8, marginBottom: 18, color: "var(--muted)" }}>
          Log in to continue.
        </p>

        {msg ? (
          <div className="card" style={{ padding: 12, borderRadius: 16, marginBottom: 14 }}>
            {msg}
          </div>
        ) : null}

        <button
          className="btn btn-ghost"
          onClick={loginWithGoogle}
          disabled={loading}
          style={{ width: "100%" }}
          type="button"
        >
          Continue with Google
        </button>

        <div className="divider">OR</div>

        <form onSubmit={loginWithEmail} className="stack-16">
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <Link className="link" href="/reset-password">
            Forgot password?
          </Link>
          <Link className="link" href="/signup">
            Create account
          </Link>
        </div>

        <div style={{ marginTop: 10, fontSize: 13 }}>
          <Link className="link" href="/">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
