import { persistRecord } from "./db";
import type { ActionArtifacts, NormalizedRecord } from "../types";

export async function persistCanonicalResult(params: {
  record: NormalizedRecord;
  result: ActionArtifacts;
  githubSyncStatus?: "not_requested" | "pending" | "synced" | "failed";
  githubSyncTarget?: string;
}): Promise<void> {
  const { record, result, githubSyncStatus, githubSyncTarget } = params;

  await persistRecord({
    record,
    outputs: {
      reply: result.reply,
      output: result.output
    },
    exportPaths: result.savedPaths,
    githubSyncStatus,
    githubSyncTarget
  });
}
