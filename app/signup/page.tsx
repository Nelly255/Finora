"use client";

import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function SignupPage() {
  return (
    // 1. We wrap everything in 'signup-scope' to trigger the special CSS variables
    // defined at the bottom of globals.css (enhanced blur, bigger shadows).
    <div className="signup-scope">
      <main className="auth-shell">
        <div className="auth-card">
          <section className="card">
            {/* 2. Added 'card-pad' for the correct 32px padding */}
            <div className="card-pad">
              <h1 className="card-title" style={{ textAlign: "center" }}>
                Create account
              </h1>
              <p className="card-subtitle" style={{ textAlign: "center" }}>
                Sign up to start tracking income & expenses.
              </p>

              {/* 3. Changed 'stack' to 'stack-24' for proper vertical spacing */}
              <form className="stack-24" onSubmit={(e) => e.preventDefault()}>
                
                {/* Google Button */}
                <button 
                  className="btn btn-ghost" 
                  type="button" 
                  style={{ width: "100%" }} // inline style to force full width
                >
                  Continue with Google
                </button>

                <div className="divider">OR</div>

                {/* Inputs */}
                <div className="stack-16">
                  <input 
                    className="input" 
                    type="email" 
                    placeholder="Email" 
                    required
                  />
                  <input 
                    className="input" 
                    type="password" 
                    placeholder="Password (min 6 chars)" 
                    required
                  />
                </div>

                {/* Submit Button */}
                <button 
                  className="btn btn-primary" 
                  type="submit"
                  style={{ width: "100%" }}
                >
                  Create account
                </button>
              </form>

              {/* Footer Links */}
              <div style={{ marginTop: "32px", textAlign: "center" }}>
                <div className="row" style={{ justifyContent: "center", marginBottom: "12px" }}>
                  <span className="muted" style={{ fontSize: "14px" }}>Already have an account?</span>
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