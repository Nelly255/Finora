"use client";

import { useState } from "react";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { supabase } from "@/lib/supabaseClient";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function updatePassword() {
    setMsg("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMsg("Password updated ✅ You can now log in.");
    } catch (e: any) {
      setMsg(e?.message ?? "Failed to update password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose a strong password and save it.">
      {msg ? <div className="glass mb-4 rounded-2xl px-4 py-3 text-sm">{msg}</div> : null}

      <div className="space-y-3">
        <input
          className="input"
          placeholder="New password (min 6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="new-password"
        />
        <button onClick={updatePassword} disabled={loading} className="btn-primary w-full">
          {loading ? "Saving..." : "Update password"}
        </button>
      </div>

      <div className="mt-4 text-sm text-white/60">
        Go to{" "}
        <Link className="text-white underline underline-offset-4" href="/login">
          Log in
        </Link>
      </div>
    </AuthShell>
  );
}
