import { runAction } from "../actions";
import { config } from "../config";
import { exportRecordPdf } from "../export/pdf";
import { ingestInputWithOptions } from "../ingest";
import { buildRecord } from "../normalize/normalizeInput";
import { ensureDatabase, fetchRecentRecords, fetchRecordById, searchRecords } from "../storage/db";
import { ensureStorageStructure } from "../storage/fs";
import type { ActionArtifacts, AppAction, CanonicalAction, ParsedCommand } from "../types";
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

  if (parsed.action === "pdf" && parsed.intentLabel === "pdf_from_record") {
    return handlePdfFromRecord(parsed.input);
  }

  const action = parsed.action as CanonicalAction;

  logInfo("ingest_started", { action });
  const ingested = await ingestInputWithOptions(parsed.input, {
    analysisMode: parsed.analysisMode
  });
  logInfo("ingest_completed", {
    action,
    sourceType: ingested.sourceType,
    completeness: ingested.completeness
  });
  const record = buildRecord(action, ingested, {
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
    action,
    recordId: record.id,
    intentLabel: parsed.intentLabel
  });
  return runAction(action, { record });
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

async function handlePdfFromRecord(recordId: string): Promise<ActionArtifacts> {
  const stored = await fetchRecordById(recordId);
  if (!stored) {
    throw new AppError(`No saved analysis found for record ID ${recordId}.`);
  }

  const pdfPath = await exportRecordPdf({
    id: stored.id,
    title: stored.title ?? "Untitled Analysis",
    sourceType: stored.sourceType,
    requestedAction: stored.requestedAction,
    createdAt: stored.createdAt,
    sourceReference: stored.sourceReference ?? `record:${stored.id}`,
    body: stored.output
  });

  return {
    reply: [
      "PDF created.",
      `Record ID: ${stored.id}`,
      `Saved PDF: ${pdfPath}`
    ].join("\n"),
    output: pdfPath,
    savedPaths: [pdfPath],
    recordId: stored.id
  };
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

  if (parsed.action === "search") {
    const query = parsed.retrievalOptions?.query ?? parsed.input ?? "";
    const matches = await searchRecords({
      query,
      limit: parsed.retrievalOptions?.limit,
      sourceType: parsed.retrievalOptions?.sourceType
    });

    if (matches.length === 0) {
      return {
        reply: `No saved analyses matched "${query}"${parsed.retrievalOptions?.sourceType ? ` in ${parsed.retrievalOptions.sourceType}` : ""}.`,
        output: `No saved analyses matched "${query}".`,
        savedPaths: []
      };
    }

    const lines = matches.map((item) =>
      `- ${item.id} | ${item.sourceType} | ${item.requestedAction} | ${item.title ?? "Untitled"} | ${item.createdAt}`
    );

    return {
      reply: [
        `Search results for "${query}"${parsed.retrievalOptions?.sourceType ? ` (${parsed.retrievalOptions.sourceType})` : ""}:`,
        ...lines
      ].join("\n"),
      output: lines.join("\n"),
      savedPaths: []
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

function isRetrievalAction(action: AppAction | undefined): action is "retrieve" | "recent" | "search" {
  return action === "retrieve" || action === "recent" || action === "search";
}
