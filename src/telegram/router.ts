import { runAction } from "../actions";
import { ingestInput } from "../ingest";
import { buildRecord } from "../normalize/normalizeInput";
import { ensureDatabase } from "../storage/db";
import { ensureStorageStructure } from "../storage/fs";
import type { ActionArtifacts } from "../types";
import { logInfo } from "../utils/logging";
import { parseCommand } from "./parseCommand";

export async function handleIncomingText(text: string): Promise<ActionArtifacts> {
  const parsed = parseCommand(text);
  if (!parsed.valid || !parsed.action || !parsed.input) {
    throw new Error(parsed.error ?? "Invalid command.");
  }

  await ensureStorageStructure();
  await ensureDatabase();

  logInfo("ingest_started", { action: parsed.action });
  const ingested = await ingestInput(parsed.input);
  logInfo("ingest_completed", {
    action: parsed.action,
    sourceType: ingested.sourceType,
    completeness: ingested.completeness
  });
  const record = buildRecord(parsed.action, ingested);

  logInfo("action_started", {
    action: parsed.action,
    recordId: record.id
  });
  return runAction(parsed.action, { record });
}
