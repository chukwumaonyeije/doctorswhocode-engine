import { runAction } from "../actions";
import { config } from "../config";
import { ingestInputWithOptions } from "../ingest";
import { buildRecord } from "../normalize/normalizeInput";
import { ensureDatabase, fetchRecentRecords, fetchRecordById } from "../storage/db";
import { ensureStorageStructure } from "../storage/fs";
import type { ActionArtifacts, AppAction, ParsedCommand } from "../types";
import { AppError } from "../utils/errors";
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

  if (isRetrievalAction(parsed.action)) {
    return handleRetrieval(parsed);
  }

  if (parsed.action === "mdx" && parsed.intentLabel === "mdx_from_record") {
    return handleMdxFromRecord(parsed.input);
  }

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

async function handleMdxFromRecord(recordId: string): Promise<ActionArtifacts> {
  const stored = await fetchRecordById(recordId);
  if (!stored) {
    throw new AppError(`No saved analysis found for record ID ${recordId}.`);
  }

  const record = {
    id: stored.id,
    slug: stored.slug,
    sourceType: stored.sourceType as
      | "text"
      | "webpage"
      | "pubmed"
      | "research_article"
      | "transcript"
      | "audio_transcript"
      | "unknown",
    sourceReference: stored.sourceReference ?? `record:${stored.id}`,
    rawInput: stored.output,
    normalizedText: stored.normalizedText ?? stored.output,
    title: stored.title ?? undefined,
    authors: [],
    publication: stored.publication ?? undefined,
    date: stored.date ?? undefined,
    completeness: (stored.completeness as
      | "full_text"
      | "abstract_only"
      | "transcript_only"
      | "partial"
      | "unknown") ?? "unknown",
    requestedAction: "mdx" as const,
    tags: [...new Set([...(stored.tags ?? []), "mdx_from_record"])],
    createdAt: new Date().toISOString(),
    model: config.openAiModel,
    status: "processed" as const,
    metadata: {
      ...(stored.metadata ?? {}),
      sourceRecordId: stored.id,
      sourceRecordAction: stored.requestedAction,
      userIntent: `mdx ${stored.id}`,
      intentLabel: "mdx_from_record"
    }
  };

  return runAction("mdx", { record });
}

async function handleRetrieval(parsed: ParsedCommand): Promise<ActionArtifacts> {
  if (parsed.action === "retrieve") {
    const record = await fetchRecordById(parsed.input!);
    if (!record) {
      throw new AppError(`No saved analysis found for record ID ${parsed.input}.`);
    }

    return {
      reply: [
        `Saved analysis: ${record.id}`,
        `Title: ${record.title ?? "Untitled"}`,
        `Source type: ${record.sourceType}`,
        `Action: ${record.requestedAction}`,
        `Created: ${record.createdAt}`,
        "",
        record.output
      ].join("\n"),
      output: record.output,
      savedPaths: [],
      recordId: record.id
    };
  }

  const recent = await fetchRecentRecords({
    limit: parsed.retrievalOptions?.limit,
    sourceType: parsed.retrievalOptions?.sourceType
  });

  if (recent.length === 0) {
    return {
      reply: "No saved analyses found for that filter yet.",
      output: "No saved analyses found for that filter yet.",
      savedPaths: []
    };
  }

  const lines = recent.map((item) =>
    `- ${item.id} | ${item.sourceType} | ${item.requestedAction} | ${item.title ?? "Untitled"} | ${item.createdAt}`
  );

  return {
    reply: [
      `Recent saved analyses${parsed.retrievalOptions?.sourceType ? ` (${parsed.retrievalOptions.sourceType})` : ""}:`,
      ...lines
    ].join("\n"),
    output: lines.join("\n"),
    savedPaths: []
  };
}

function isRetrievalAction(action: AppAction | undefined): action is "retrieve" | "recent" {
  return action === "retrieve" || action === "recent";
}
