export type CuisineAffinity = {
  score: number;
  reason: string;
};

export const EVENT_COLOR_MAP: Record<string, string> = {
  expos: "#2962FF",
  conferences: "#14b8a6",
  concerts: "#a855f7",
  sports: "#22c55e",
  festivals: "#ff6b35",
  "performing-arts": "#f59e0b",
  community: "#06b6d4",
  "school-holidays": "#ec4899",
  fallback: "#6b7280",
};

export const CUISINE_AFFINITY_MATRIX: Record<string, Record<string, CuisineAffinity>> = {
  expos: {
    steakhouse: { score: 88, reason: "Expo traffic favors hosted dinners and group dining." },
    asian: { score: 74, reason: "Expo groups often need quick, shareable business meals." },
    buffet: { score: 82, reason: "Expo windows increase demand for high-volume service formats." },
  },
  conferences: {
    steakhouse: { score: 85, reason: "Conference spend clusters around client meals and networking." },
    italian: { score: 77, reason: "Conference groups favor sit-down team meals near venues." },
    seafood: { score: 79, reason: "Conference dining budgets support higher-ticket menus." },
  },
  concerts: {
    burger: { score: 86, reason: "Concert windows reward fast pre-show and post-show turns." },
    pizza: { score: 84, reason: "Concert crowds lean toward fast, shareable meals." },
    pub: { score: 81, reason: "Concert demand drives drink-led and late-night volume." },
  },
  sports: {
    pub: { score: 90, reason: "Sports windows drive game-day wings, beer, and group tables." },
    burger: { score: 84, reason: "Sports events support repeat quick-service volume." },
    bbq: { score: 74, reason: "Sports parties create shareable, high-throughput orders." },
  },
  festivals: {
    mexican: { score: 82, reason: "Festival traffic skews to quick, flavorful, portable meals." },
    chicken: { score: 76, reason: "Festival windows reward fast, high-repeat menu items." },
    american: { score: 72, reason: "Festival crowds favor broad menus and quick throughput." },
  },
  "performing-arts": {
    italian: { score: 83, reason: "Theater demand favors pre-show sit-down dining." },
    seafood: { score: 80, reason: "Performing-arts nights lift premium dinner demand." },
    steakhouse: { score: 84, reason: "Performing-arts traffic supports upscale timed dining." },
  },
};

export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function pickString(metadata: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function pickNumber(metadata: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/,/g, "").trim());
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function pickBoolean(metadata: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "yes", "y", "1"].includes(normalized)) return true;
      if (["false", "no", "n", "0"].includes(normalized)) return false;
    }
  }
  return null;
}

export function pickGlideData(metadata: Record<string, unknown>): Record<string, unknown> {
  return asObject(metadata.glide_data);
}

export function normalizeEventCategory(value: string | null): string {
  if (!value) return "community";
  const normalized = value.trim().toLowerCase();
  if (normalized === "performing_arts") return "performing-arts";
  if (normalized === "school_holidays") return "school-holidays";
  if (normalized === "conference") return "conferences";
  if (normalized === "expo") return "expos";
  if (normalized === "concert") return "concerts";
  if (normalized === "sport") return "sports";
  if (normalized in EVENT_COLOR_MAP) return normalized;
  return "community";
}

export function toEventColor(category: string): string {
  return EVENT_COLOR_MAP[category] ?? EVENT_COLOR_MAP.fallback;
}

export function toMidnight(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function toDaysUntil(current: Date, futureDateText: string): number {
  const now = toMidnight(current).getTime();
  const target = toMidnight(new Date(futureDateText)).getTime();
  return Math.max(0, Math.floor((target - now) / 86400000));
}

export function toNullableIso(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function toDurationDays(startDate: string, endDate: string | null): number {
  if (!endDate) return 1;
  const start = toMidnight(new Date(startDate)).getTime();
  const end = toMidnight(new Date(endDate)).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 1;
  return Math.max(1, Math.floor((end - start) / 86400000) + 1);
}

export function normalizeCuisineType(value: string | null): string | null {
  if (!value) return null;
  return value.trim().toLowerCase();
}

export function resolveCuisineAffinity(category: string, cuisineType: string | null): CuisineAffinity {
  if (!cuisineType) return { score: 30, reason: "General dining option." };
  const categoryMap = CUISINE_AFFINITY_MATRIX[category];
  if (!categoryMap) return { score: 30, reason: "General dining option." };
  return categoryMap[cuisineType] ?? { score: 30, reason: "General dining option." };
}

const WORD_NUMBER_MAP: Record<string, number> = {
  one: 1,
  once: 1,
  two: 2,
  twice: 2,
  three: 3,
  thrice: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
};

const DAY_TOKENS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "mon",
  "tue",
  "tues",
  "wed",
  "thu",
  "thur",
  "thurs",
  "fri",
  "sat",
  "sun",
];

function matchWordNumber(text: string): number | null {
  for (const [word, value] of Object.entries(WORD_NUMBER_MAP)) {
    if (new RegExp(`(?<![a-z])${word}(?![a-z])`).test(text)) {
      return value;
    }
  }
  return null;
}

function matchNumeric(text: string): number | null {
  const numericMatch = text.match(/(\d+(?:\.\d+)?)/);
  if (!numericMatch) return null;
  const parsed = Number(numericMatch[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// Deterministic Glide-only oil-change cadence model. Maps the restaurant service
// schedule (Po4Zg frequency text + lf0gF day list) to oil changes per week.
// Month-based cadences use a 4-week month (N per month = N * 0.25 per week).
// Returns null when the schedule is not populated; callers must not guess.
// Mirrored exactly by service_changes_per_week in scripts/sync_vegas_glide_to_supabase.py.
export function serviceChangesPerWeek(
  frequency: string | null,
  days: string | null,
): number | null {
  const freq = (frequency ?? "").trim().toLowerCase();
  const dayText = (days ?? "").trim().toLowerCase();

  if (dayText) {
    const dayCount = DAY_TOKENS.reduce((count, token) => {
      const pattern = new RegExp(`(?<![a-z])${token}(?![a-z])`, "g");
      return count + (dayText.match(pattern)?.length ?? 0);
    }, 0);
    if (dayCount > 0) return Math.min(7, dayCount);
  }

  if (!freq) return null;
  if (freq.includes("daily") || freq.includes("every day")) return 7;

  // Multi-week intervals must resolve before the generic weekly check because
  // "biweekly"/"bi-weekly" contain the substring "weekly".
  if (freq.includes("biweekly") || freq.includes("bi-weekly") || freq.includes("every other week")) {
    return 0.5;
  }
  const everyNWeeks = freq.match(
    /every\s+(\d+(?:\.\d+)?|two|three|four|five|six|seven)\s+weeks?/,
  );
  if (everyNWeeks) {
    const interval = WORD_NUMBER_MAP[everyNWeeks[1]] ?? Number(everyNWeeks[1]);
    if (Number.isFinite(interval) && interval > 0) return Math.min(7, 1 / interval);
  }

  // Month-based cadences must resolve before "once"/word-number checks so
  // "once a month" and "twice a month" stay monthly, not weekly.
  if (freq.includes("month")) {
    const perMonth = matchWordNumber(freq) ?? matchNumeric(freq) ?? 1;
    return Math.min(7, perMonth * 0.25);
  }

  if (freq.includes("weekly") || freq.includes("every week") || freq.includes("once")) return 1;

  const wordValue = matchWordNumber(freq);
  if (wordValue !== null) return Math.min(7, wordValue);

  const numericValue = matchNumeric(freq);
  if (numericValue !== null) return Math.min(7, numericValue);

  return null;
}

// Estimated weekly soybean-oil volume an account actually consumes, derived only
// from verified Glide fryer capacity and service cadence. Returns null when either
// input is missing so the UI can surface incomplete telemetry honestly.
export function estimateOilLbsPerWeek(
  totalCapacityLbs: number | null,
  changesPerWeek: number | null,
): number | null {
  if (totalCapacityLbs === null || totalCapacityLbs <= 0) return null;
  if (changesPerWeek === null || changesPerWeek <= 0) return null;
  return Math.round(totalCapacityLbs * changesPerWeek);
}
