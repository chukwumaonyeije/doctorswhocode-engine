import { runAction } from "../actions";
import { ingestInputWithOptions } from "../ingest";
import { buildRecord } from "../normalize/normalizeInput";
import { ensureDatabase } from "../storage/db";
import { ensureStorageStructure } from "../storage/fs";
import type { ActionArtifacts, ParsedCommand } from "../types";
import { logInfo } from "../utils/logging";
import { parseCommand } from "./parseCommand";

export async function handleIncomingText(text: string): Promise<ActionArtifacts> {
  const parsed = parseCommand(text);
  return handleParsedCommand(parsed);
}

export async function handleParsedCommand(parsed: ParsedCommand): Promise<ActionArtifacts> {
  if (!parsed.valid || !parsed.action || !parsed.input) {
    throw new Error(parsed.error ?? "Invalid command.");
  }

  await ensureStorageStructure();
  await ensureDatabase();

  logInfo("ingest_started", { action: parsed.action });
  const ingested = await ingestInputWithOptions(parsed.input, {
    analysisMode: parsed.analysisMode
  });
  logInfo("ingest_completed", {
    action: parsed.action,
    sourceType: ingested.sourceType,
    completeness: ingested.completeness
  });
  const record = buildRecord(parsed.action, ingested, {
    metadata: {
      userIntent: parsed.rawRequest,
      intentLabel: parsed.intentLabel,
      contextNote: parsed.contextNote,
      requestedFocus: parsed.requestedFocus,
      analysisMode: parsed.analysisMode
    },
    tags: parsed.requestedFocus ?? []
  });

  logInfo("action_started", {
    action: parsed.action,
    recordId: record.id,
    intentLabel: parsed.intentLabel
  });
  return runAction(parsed.action, { record });
}
