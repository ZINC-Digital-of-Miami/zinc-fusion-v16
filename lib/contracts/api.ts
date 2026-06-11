export type IsoDateTimeString = string;

export interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  asOf: IsoDateTimeString;
  source?: string;
  warning?: string;
}

export interface AiEnvelopeMeta {
  enabled: boolean;
  source: string;
  model: string | null;
  reasoningEffort: string | null;
  generatedAt: string | null;
  refreshScheduleEt: string | null;
}

export interface ZlPriceBar {
  symbol: string;
  tradeDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ZlLivePrice {
  symbol: string;
  price: number;
  observedAt: IsoDateTimeString;
}

export interface TargetZone {
  horizonDays: number;
  p30: number;
  p50: number;
  p70: number;
  generatedAt: IsoDateTimeString;
}

export interface ForecastSummary {
  horizonDays: number;
  predictedPrice: number;
  hitProbability: number;
  modelVersion: string;
}

export interface DriverAttribution {
  factor: string;
  contribution: number;
  confidence: number;
}

export interface RegimeState {
  regime: string;
  confidence: number;
  updatedAt: IsoDateTimeString;
}

export interface StrategyPosture {
  posture: "ACCUMULATE" | "WAIT" | "DEFER";
  rationale: string;
  updatedAt: IsoDateTimeString;
}

export interface SentimentOverview {
  headlineCount: number;
  sentimentScore: number;
  cotBias: string;
  updatedAt: IsoDateTimeString;
}

export interface LegislationItem {
  source: string;
  title: string;
  publishedAt: IsoDateTimeString;
  tags: string[];
}

export interface VegasIntelSnapshot {
  activeEvents: number;
  highPriorityAccounts: number;
  updatedAt: IsoDateTimeString;
}

export interface VegasIntelStats {
  restaurants: number;
  casinos: number;
  fryers: number;
  exportList: number | null;
  shifts: number | null;
  scheduledReports: number | null;
  shiftCasinos: number | null;
  shiftRestaurants: number | null;
  lastSync: IsoDateTimeString | null;
}

export interface VegasEventRow {
  id: number;
  name: string;
  category: string;
  venue: string | null;
  attendance: number;
  startDate: string;
  endDate: string | null;
  durationDays: number;
  daysUntil: number;
  color: string;
  location: string | null;
}

export interface VegasOpportunityRow {
  id: number;
  glideRowId: string | null;
  name: string;
  casino: string | null;
  location: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  serviceFrequency: string | null;
  changesPerWeek: number | null;
  oilType: string | null;
  oilForm: string | null;
  cuisineType: string | null;
  status: string | null;
  fryerCount: number | null;
  totalCapacityLbs: number | null;
  estimatedOilLbsPerWeek: number | null;
  customerStatus: "customer" | "prospect";
  eventId: number | null;
  eventName: string | null;
  eventCategory: string | null;
  eventDate: string | null;
  eventDaysUntil: number | null;
  cuisineAffinityScore: number | null;
  cuisineAffinityReason: string | null;
  // Verified-only modeled signals: populated from real vegas.customer_scores /
  // vegas.event_impact rows when present, explicit null otherwise. No synthetic
  // score is ever computed for missing rows.
  opportunityScore: number | null;
  eventPressure: number | null;
  expectedSpend: number | null;
  hospitalityImpact: number | null;
  phqMultiplier: number | null;
  zfusionScore: number | null;
  shiftCount: number | null;
  scheduledReportCount: number | null;
  exportListed: boolean | null;
  metadata: Record<string, unknown>;
}

export interface VegasGlideTableCounts {
  restaurants: number | null;
  casinos: number | null;
  fryers: number | null;
  exportList: number | null;
  scheduledReports: number | null;
  shifts: number | null;
  shiftCasinos: number | null;
  shiftRestaurants: number | null;
}
