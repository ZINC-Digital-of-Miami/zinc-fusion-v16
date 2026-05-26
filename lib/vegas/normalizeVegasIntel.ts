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

export function toPhqMultiplier(attendance: number): number {
  const attendanceScore = Math.min(100000, Math.max(0, attendance || 5000)) / 100000;
  return 0.5 + attendanceScore * 1.5;
}
