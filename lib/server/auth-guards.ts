import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";

export async function requireAuthenticatedApiRequest() {
  if (!hasEnvVars) {
    return NextResponse.json(
      { ok: false, error: "Supabase auth env vars are not configured" },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  return null;
}

export async function requireAuthenticatedPageSession() {
  if (!hasEnvVars) {
    redirect("/auth/login");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }
}
