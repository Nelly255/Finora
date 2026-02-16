"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const errorDesc = url.searchParams.get("error_description");

        // If provider returned an error, bounce to login with message
        if (errorDesc) {
          router.replace(`/login?error=${encodeURIComponent(errorDesc)}`);
          return;
        }

        // ✅ PKCE: explicitly exchange code for session
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            router.replace(`/login?error=${encodeURIComponent(error.message)}`);
            return;
          }
        }

        // Now we should have a session
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          router.replace("/dashboard");
        } else {
          router.replace("/login");
        }
      } catch (e: any) {
        router.replace(`/login?error=${encodeURIComponent(e?.message ?? "Auth failed")}`);
      }
    })();
  }, [router]);

  return (
    <main className="auth-shell">
      <div className="auth-card card card-pad" style={{ maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>Signing you in…</h2>
        <p style={{ color: "var(--muted)" }}>Please wait.</p>
      </div>
    </main>
  );
}
