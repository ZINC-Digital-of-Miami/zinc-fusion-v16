import { readFile } from "node:fs/promises";
import path from "node:path";

export type AiSnapshotMeta = {
  generatedAt: string;
  model: string;
  reasoningEffort: string;
  source?: string;
  refreshScheduleEt?: string;
};

export type AiEnvelopeMeta = {
  enabled: boolean;
  source: string;
  model: string | null;
  reasoningEffort: string | null;
  generatedAt: string | null;
  refreshScheduleEt: string | null;
};

const TRUSTED_SNAPSHOT_SOURCES = new Set([
  "trusted-live-pull",
  "trusted-authority-pull",
  "ai-daily-refresh",
  "chatgpt-pro-subscription-refresh",
  "openrouter-daily-refresh",
]);

const SNAPSHOT_LOADERS: Record<string, () => Promise<unknown>> = {
  "app/config/dashboard-risk-factors-ai.json": async () =>
    (await import("@/app/config/dashboard-risk-factors-ai.json")).default,
  "app/config/strategy-posture-ai.json": async () =>
    (await import("@/app/config/strategy-posture-ai.json")).default,
  "app/config/sentiment-overview-ai.json": async () =>
    (await import("@/app/config/sentiment-overview-ai.json")).default,
  "app/config/legislation-feed-ai.json": async () =>
    (await import("@/app/config/legislation-feed-ai.json")).default,
  "app/config/vegas-intel-ai.json": async () =>
    (await import("@/app/config/vegas-intel-ai.json")).default,
};

function coerceSnapshot<T extends object>(parsed: unknown): (T & AiSnapshotMeta) | null {
  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as T & Partial<AiSnapshotMeta>;
  if (typeof candidate.generatedAt !== "string" || candidate.generatedAt.trim().length === 0) return null;
  if (typeof candidate.model !== "string" || candidate.model.trim().length === 0) return null;
  if (typeof candidate.reasoningEffort !== "string" || candidate.reasoningEffort.trim().length === 0) return null;
  const snapshotSource =
    typeof candidate.source === "string" ? candidate.source.trim().toLowerCase() : "";
  if (!TRUSTED_SNAPSHOT_SOURCES.has(snapshotSource)) return null;
  return candidate as T & AiSnapshotMeta;
}

export async function readAiSnapshot<T extends object>(
  relativePathFromRepoRoot: string,
): Promise<(T & AiSnapshotMeta) | null> {
  try {
    const loader = SNAPSHOT_LOADERS[relativePathFromRepoRoot];
    if (loader) {
      const imported = await loader();
      const validated = coerceSnapshot<T>(imported);
      if (validated) return validated;
    }

    const fullPath = path.join(
      /* turbopackIgnore: true */ process.cwd(),
      relativePathFromRepoRoot,
    );
    const raw = await readFile(fullPath, "utf8");
    return coerceSnapshot<T>(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function toAiEnvelopeMeta(snapshot: AiSnapshotMeta | null): AiEnvelopeMeta {
  return {
    enabled: Boolean(snapshot),
    source: snapshot?.source ?? "none",
    model: snapshot?.model ?? null,
    reasoningEffort: snapshot?.reasoningEffort ?? null,
    generatedAt: snapshot?.generatedAt ?? null,
    refreshScheduleEt: snapshot?.refreshScheduleEt ?? null,
  };
}
