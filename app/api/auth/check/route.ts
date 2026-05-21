import { NextResponse } from "next/server";

import { isAuthDisabledForBuild } from "@/lib/auth-mode";
import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";

export async function GET() {
  if (isAuthDisabledForBuild()) {
    return NextResponse.json({
      ok: true,
      authenticated: false,
      authDisabledForBuild: true,
      checkedAt: new Date().toISOString(),
    });
  }

  if (!hasEnvVars) {
    return NextResponse.json(
      {
        ok: false,
        authenticated: false,
        error: "Supabase auth env vars are not configured",
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        authenticated: false,
        error: error.message,
        checkedAt: new Date().toISOString(),
      },
      { status: 401 },
    );
  }

  if (!data?.claims) {
    return NextResponse.json(
      {
        ok: false,
        authenticated: false,
        error: "No authenticated user claims",
        checkedAt: new Date().toISOString(),
      },
      { status: 401 },
    );
  }

  return NextResponse.json({
    ok: true,
    authenticated: true,
    checkedAt: new Date().toISOString(),
  });
}
