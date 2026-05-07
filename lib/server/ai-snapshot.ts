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

export async function readAiSnapshot<T extends object>(
  relativePathFromRepoRoot: string,
): Promise<(T & AiSnapshotMeta) | null> {
  try {
    const fullPath = path.join(
      /* turbopackIgnore: true */ process.cwd(),
      relativePathFromRepoRoot,
    );
    const raw = await readFile(fullPath, "utf8");
    const parsed = JSON.parse(raw) as T & Partial<AiSnapshotMeta>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.generatedAt !== "string" || parsed.generatedAt.trim().length === 0) return null;
    if (typeof parsed.model !== "string" || parsed.model.trim().length === 0) return null;
    if (typeof parsed.reasoningEffort !== "string" || parsed.reasoningEffort.trim().length === 0) return null;
    return parsed as T & AiSnapshotMeta;
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
