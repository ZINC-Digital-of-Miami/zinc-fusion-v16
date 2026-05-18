import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { ApiEnvelope, RegimeState } from "@/lib/contracts/api";

export async function GET() {
  try {
    const supabase = await createClient();

    // Get the latest regime state
    const { data: row, error } = await supabase
      .schema("analytics")
      .from("regime_state_1d")
      .select("regime, confidence, trade_date")
      .order("trade_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, data: null, asOf: new Date().toISOString(), error: error.message },
        { status: 500 },
      );
    }

    const regime: RegimeState | null = row
      ? {
          regime: row.regime,
          confidence: Number(row.confidence),
          updatedAt: row.trade_date,
        }
      : null;

    const envelope: ApiEnvelope<RegimeState | null> = {
      ok: true,
      data: regime,
      asOf: new Date().toISOString(),
      source: "analytics.regime_state_1d",
    };

    return NextResponse.json(envelope);
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: null, asOf: new Date().toISOString(), error: String(err) },
      { status: 500 },
    );
  }
}
