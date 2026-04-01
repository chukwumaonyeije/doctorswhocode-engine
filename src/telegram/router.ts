import { runAction } from "../actions";
import { ingestInput } from "../ingest";
import { buildRecord } from "../normalize/normalizeInput";
import { ensureDatabase } from "../storage/db";
import { ensureStorageStructure } from "../storage/fs";
import type { ActionArtifacts } from "../types";
import { parseCommand } from "./parseCommand";

export async function handleIncomingText(text: string): Promise<ActionArtifacts> {
  const parsed = parseCommand(text);
  if (!parsed.valid || !parsed.action || !parsed.input) {
    throw new Error(parsed.error ?? "Invalid command.");
  }

  await ensureStorageStructure();
  await ensureDatabase();

  const ingested = await ingestInput(parsed.input);
  const record = buildRecord(parsed.action, ingested);

  return runAction(parsed.action, { record });
}
