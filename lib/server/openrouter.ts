import "server-only";

export type VegasIntelReportInput = {
  restaurantName: string;
  casinoName: string | null;
  customerStatus: string;
  eventName: string;
  eventCategory: string;
  eventDate: string | null;
  daysUntil: number | null;
  attendance: number | null;
  oilType: string | null;
  oilForm: string | null;
  location: string | null;
  contactName: string | null;
  contactEmail: string | null;
  cuisineType: string | null;
  cuisineAffinityScore: number;
  cuisineAffinityReason: string;
  serviceFrequency: string | null;
  changesPerWeek: number | null;
  fryerCount: number | null;
  totalCapacityLbs: number | null;
  estimatedOilLbsPerWeek: number | null;
  pitchAngle: string;
  evidenceBullets: string[];
  missingEvidence: string[];
};

export type VegasIntelReport = {
  executiveBrief: string;
  pitchAngle: string;
  salesScript: string;
  emailDraft: string;
  callPlan: string[];
  objectionHandling: string[];
  riskFlags: string[];
  evidenceSummary: string[];
  nextAction: string;
};

export type VegasIntelReportResult =
  | {
      ok: true;
      provider: "openrouter";
      model: string;
      report: VegasIntelReport;
    }
  | {
      ok: false;
      provider: "openrouter";
      model: string | null;
      error: string;
    };

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_INTEL_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

function openRouterApiKey(): string | null {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  return key ? key : null;
}

function openRouterIntelModel(): string {
  return process.env.OPENROUTER_INTEL_MODEL?.trim() || DEFAULT_OPENROUTER_INTEL_MODEL;
}

function openRouterHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const referer =
    process.env.OPENROUTER_APP_REFERER?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (referer) headers["HTTP-Referer"] = referer;

  const title = process.env.OPENROUTER_APP_TITLE?.trim() || "ZINC Fusion V16 Vegas Intel";
  headers["X-Title"] = title;

  return headers;
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const unfenced = stripCodeFence(text);
  try {
    const parsed = JSON.parse(unfenced);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(unfenced.slice(start, end + 1));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
}

function textFromMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";
        const candidate = part as Record<string, unknown>;
        return typeof candidate.text === "string" ? candidate.text : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function coerceString(value: unknown, fallback: string, maxLength = 1400): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
}

function coerceStringArray(value: unknown, fallback: string[], maxItems = 6): string[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, maxItems);
  return cleaned.length > 0 ? cleaned : fallback;
}

function coerceReport(parsed: Record<string, unknown>, fallback: VegasIntelReport): VegasIntelReport {
  return {
    executiveBrief: coerceString(parsed.executiveBrief, fallback.executiveBrief),
    pitchAngle: coerceString(parsed.pitchAngle, fallback.pitchAngle, 700),
    salesScript: coerceString(parsed.salesScript, fallback.salesScript, 1800),
    emailDraft: coerceString(parsed.emailDraft, fallback.emailDraft, 1800),
    callPlan: coerceStringArray(parsed.callPlan, fallback.callPlan),
    objectionHandling: coerceStringArray(parsed.objectionHandling, fallback.objectionHandling),
    riskFlags: coerceStringArray(parsed.riskFlags, fallback.riskFlags),
    evidenceSummary: coerceStringArray(parsed.evidenceSummary, fallback.evidenceSummary),
    nextAction: coerceString(parsed.nextAction, fallback.nextAction, 700),
  };
}

export function fallbackVegasIntelReport(input: VegasIntelReportInput): VegasIntelReport {
  const capacityText =
    input.totalCapacityLbs !== null ? `${Math.round(input.totalCapacityLbs)} lbs` : "missing capacity";
  const weeklyOilText =
    input.estimatedOilLbsPerWeek !== null
      ? `${input.estimatedOilLbsPerWeek.toLocaleString()} lbs/week estimated oil`
      : "missing weekly oil estimate";
  const fryerText = input.fryerCount !== null ? `${input.fryerCount} fryers` : "missing fryer telemetry";
  const eventText = input.eventDate ? `${input.eventName} on ${input.eventDate}` : input.eventName;
  const missingText =
    input.missingEvidence.length > 0 ? input.missingEvidence.join(", ") : "No required gaps detected";

  return {
    executiveBrief:
      `${input.restaurantName}${input.casinoName ? ` at ${input.casinoName}` : ""} is a ${input.customerStatus} opportunity tied to ${eventText}. ` +
      `Current read: ${input.pitchAngle} Keep the pitch practical and event-timed.`,
    pitchAngle: input.pitchAngle,
    salesScript:
      `Lead with ${eventText}. Tie the pitch to ${input.cuisineAffinityReason.toLowerCase()} and anchor to ${fryerText}, ${capacityText}, ` +
      `${weeklyOilText}, ${input.oilType ?? "missing oil type"}, and ${input.serviceFrequency ?? "missing service cadence"}. If evidence is thin, say it directly.`,
    emailDraft:
      `Subject: ${input.restaurantName} event-readiness oil plan\n\n` +
      `Quick note on ${eventText}: your current event window lines up with ${input.cuisineAffinityReason.toLowerCase()} ` +
      `I would like to tighten oil continuity and fryer uptime planning before the rush window so the team is not reacting late. Current Glide-backed usage read: ${weeklyOilText}.`,
    callPlan: [
      `Open with the ${eventText} demand window and expected attendance pressure.`,
      `Confirm contact, service cadence, oil profile, fryer count, capacity, and weekly oil estimate before making claims.`,
      `Position ZINC as continuity insurance so operations are proactive instead of improvising.`,
    ],
    objectionHandling: [
      "If timing is challenged, anchor the answer to verified event date and service cadence.",
      "If price sensitivity appears, keep focus on continuity, uptime, and missed-rush cost.",
    ],
    riskFlags: input.missingEvidence.length > 0 ? input.missingEvidence : ["No required gaps detected"],
    evidenceSummary: input.evidenceBullets.slice(0, 6),
    nextAction:
      input.missingEvidence.length > 0
        ? `Collect missing fields before final send: ${missingText}.`
        : "Send the pitch sheet, prep same-day outreach, and queue follow-up inside the event-demand window.",
  };
}

export async function generateVegasIntelReport(
  input: VegasIntelReportInput,
): Promise<VegasIntelReportResult> {
  const apiKey = openRouterApiKey();
  const model = openRouterIntelModel();
  if (!apiKey) {
    return {
      ok: false,
      provider: "openrouter",
      model,
      error: "OPENROUTER_API_KEY is not configured.",
    };
  }

  const fallback = fallbackVegasIntelReport(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: openRouterHeaders(apiKey),
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 1600,
        messages: [
          {
            role: "system",
            content:
              "You generate concise, high-signal Las Vegas restaurant sales intelligence reports for Kevin at US Oil Solutions. " +
              "Tone: sharp, practical, commercially useful, lightly sarcastic, always professional. " +
              "Audience is Kevin (sales procurement and meeting development), not a generic executive audience. " +
              "Use only the supplied evidence. Do not invent contacts, prices, events, capacity, or service facts. " +
              "When evidence is missing, state the missing field as a risk. Keep sections brief: 1-3 sentences or short bullets. " +
              "Use subtle dry humor only when it reinforces business utility. Avoid memes, hype, or political commentary. " +
              "Return JSON only with keys: " +
              "executiveBrief, pitchAngle, salesScript, emailDraft, callPlan, objectionHandling, riskFlags, evidenceSummary, nextAction.",
          },
          {
            role: "user",
            content: JSON.stringify({
              objective:
                "Create a data-driven Intel sheet for one restaurant account. Keep it concise, meeting-ready, and operational.",
              evidence: input,
            }),
          },
        ],
      }),
    });

    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      const error =
        payload && typeof payload.error === "object" && payload.error !== null
          ? JSON.stringify(payload.error)
          : `OpenRouter request failed with status ${response.status}.`;
      return { ok: false, provider: "openrouter", model, error };
    }

    const choices = Array.isArray(payload?.choices) ? payload.choices : [];
    const firstChoice = choices[0] as Record<string, unknown> | undefined;
    const message =
      firstChoice && typeof firstChoice.message === "object" && firstChoice.message !== null
        ? (firstChoice.message as Record<string, unknown>)
        : null;
    const content = textFromMessageContent(message?.content);
    const parsed = parseJsonObject(content);
    if (!parsed) {
      return {
        ok: false,
        provider: "openrouter",
        model,
        error: "OpenRouter response did not contain a valid JSON report.",
      };
    }

    return {
      ok: true,
      provider: "openrouter",
      model,
      report: coerceReport(parsed, fallback),
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "OpenRouter request timed out."
        : error instanceof Error
          ? error.message
          : String(error);
    return { ok: false, provider: "openrouter", model, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
