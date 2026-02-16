import Link from "next/link";

export default function Home() {
  return (
    // 1. 'signup-scope' activates the premium glass variables & larger shadows
    <div className="signup-scope">
      <main className="auth-shell">
        {/* 2. 'auth-card' constrains the width to 520px */}
        <div className="auth-card">
          <section className="card">
            {/* 3. 'card-pad' adds the necessary 32px padding */}
            <div className="card-pad">
              
              {/* Header Section */}
              <div style={{ textAlign: "center", marginBottom: "8px" }}>
                <h1 className="card-title">Welcome to Finora</h1>
                <p className="card-subtitle">
                  Track income and expenses with Finora — clean UI, fast input, and simple summaries.
                </p>
              </div>

              {/* Action Buttons */}
              {/* Used 'stack-16' for consistent spacing between buttons */}
              <div className="stack-16">
                <Link 
                  className="btn btn-primary" 
                  href="/signup"
                  style={{ display: "block", textAlign: "center" }}
                >
                  Create account
                </Link>

                <Link 
                  className="btn btn-ghost" 
                  href="/login"
                  style={{ display: "block", textAlign: "center" }}
                >
                  Log in
                </Link>

                <Link 
                  className="btn btn-ghost" 
                  href="/dashboard"
                  style={{ display: "block", textAlign: "center", opacity: 0.8 }}
                >
                  Go to dashboard
                </Link>
              </div>

              {/* Footer / Tip Section */}
              <div style={{ marginTop: "32px", textAlign: "center" }}>
                <p 
                  style={{ 
                    fontSize: "12px", 
                    color: "var(--muted)", 
                    margin: 0, 
                    lineHeight: "1.5",
                    opacity: 0.7 
                  }}
                >
                   2026. All right reserved.
                </p>
              </div>

            </div>
          </section>
        </div>
      </main>
    </div>
  );
}