export type StrategicSpecialInstructions = {
  cardTopic: string;
  strategicObjective: string;
  neuralConnectionThesis: string;
  quantResearchProtocol: string[];
  inferenceConstraints: string[];
  outputRequirements: string[];
};

export type AiCardDataPoint = {
  label: string;
  value: string;
  asOf?: string;
  source?: string;
};

export type AiCardProvenanceRecord = {
  source: string;
  table?: string;
  recordHint?: string;
  publishedAt?: string;
  observedAt?: string;
  url?: string;
};

export type AiCardProvenance = {
  asOf: string;
  generatedAt: string;
  method: string;
  sourceFeeds: string[];
  sourceRecords: AiCardProvenanceRecord[];
  notes?: string[];
};

export type AiCardContent = {
  title: string;
  body: string;
  strategicSpecialInstructions: StrategicSpecialInstructions;
  provenance: AiCardProvenance;
  dataPoints?: AiCardDataPoint[];
};
