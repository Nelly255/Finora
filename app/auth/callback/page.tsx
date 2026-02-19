"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Starting…");

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const errorDesc = url.searchParams.get("error_description");

        if (errorDesc) {
          setStatus("Provider error: " + errorDesc);
          router.replace(`/login?error=${encodeURIComponent(errorDesc)}`);
          return;
        }

        if (!code) {
          setStatus("No code in URL.");
          router.replace("/login?error=" + encodeURIComponent("Missing OAuth code"));
          return;
        }

        setStatus("Exchanging code for session…");
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          setStatus("Exchange error: " + error.message);
          router.replace(`/login?error=${encodeURIComponent(error.message)}`);
          return;
        }

        // small delay helps cookie/localStorage settle
        await new Promise((r) => setTimeout(r, 250));

        setStatus("Checking session…");
        const { data } = await supabase.auth.getSession();

        if (data.session) {
          setStatus("✅ Session OK. Redirecting to dashboard…");
          router.replace("/dashboard");
        } else {
          setStatus("❌ No session after exchange.");
          router.replace("/login?error=" + encodeURIComponent("No session after exchange"));
        }
      } catch (e: any) {
        const msg = e?.message ?? "Auth failed";
        setStatus("Exception: " + msg);
        router.replace(`/login?error=${encodeURIComponent(msg)}`);
      }
    })();
  }, [router]);

  return (
    <main className="auth-shell">
      <div className="auth-card card card-pad" style={{ maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>Signing you in…</h2>
        <p style={{ color: "var(--muted)" }}>{status}</p>
      </div>
    </main>
  );
}
