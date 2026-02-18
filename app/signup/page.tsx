"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        // If you use email confirmations, user will need to verify via email.
        // You can also set redirect for email links:
        // options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });

      if (error) throw error;

      // If email confirmation is ON, data.user may exist but session can be null until verified.
      setSuccessMsg(
        data.session
          ? "Account created! Redirecting..."
          : "Check your email to confirm your account."
      );

      // If you have a dashboard route, redirect when session exists:
      if (data.session) router.push("/dashboard");
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Signup failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Google sign-in failed.");
      setLoading(false);
    }
  };

  return (
    <div className="signup-scope">
      <main className="auth-shell">
        <div className="auth-card">
          <section className="card">
            <div className="card-pad">
              <h1 className="card-title" style={{ textAlign: "center" }}>
                Create account
              </h1>
              <p className="card-subtitle" style={{ textAlign: "center" }}>
                Sign up to start tracking income & expenses.
              </p>

              <form className="stack-24" onSubmit={handleSignup}>
                <button
                  className="btn btn-ghost"
                  type="button"
                  style={{ width: "100%" }}
                  onClick={handleGoogle}
                  disabled={loading}
                >
                  {loading ? "Please wait..." : "Continue with Google"}
                </button>

                <div className="divider">OR</div>

                <div className="stack-16">
                  <input
                    className="input"
                    type="email"
                    placeholder="Email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <input
                    className="input"
                    type="password"
                    placeholder="Password (min 6 chars)"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <button
                  className="btn btn-primary"
                  type="submit"
                  style={{ width: "100%" }}
                  disabled={loading}
                >
                  {loading ? "Creating..." : "Create account"}
                </button>

                {errorMsg && (
                  <p style={{ color: "crimson", marginTop: 8 }}>{errorMsg}</p>
                )}
                {successMsg && (
                  <p style={{ color: "green", marginTop: 8 }}>{successMsg}</p>
                )}
              </form>

              <div style={{ marginTop: "32px", textAlign: "center" }}>
                <div
                  className="row"
                  style={{
                    justifyContent: "center",
                    marginBottom: "12px",
                    gap: "8px",
                  }}
                >
                  <span className="muted" style={{ fontSize: "14px" }}>
                    Already have an account?
                  </span>
                  <Link href="/login" className="link" style={{ fontSize: "14px" }}>
                    Log in
                  </Link>
                </div>

                <Link className="link muted" href="/" style={{ fontSize: "13px" }}>
                  Back to Home
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
