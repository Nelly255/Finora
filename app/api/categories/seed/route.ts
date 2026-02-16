import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    if (!url || !key) {
      return NextResponse.json(
        { ok: false, error: "Missing Supabase env vars" },
        { status: 500 }
      );
    }

    const supabase = createClient(url, key);

    // NOTE: If your categories table has a user_id NOT NULL constraint,
    // this seed must include user_id.
    // If it doesn't, it's fine as-is.
    const defaults = [
      { name: "Bills", type: "expense" },
      { name: "Food", type: "expense" },
      { name: "Transport", type: "expense" },
      { name: "Rent", type: "expense" },
      { name: "Salary", type: "income" },
      { name: "Freelance", type: "income" },
    ];

    // Upsert prevents duplicate constraint errors
    const { error } = await supabase
      .from("categories")
      .upsert(defaults, { onConflict: "name,type" });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
