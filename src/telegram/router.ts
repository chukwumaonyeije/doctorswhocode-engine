import { runAction } from "../actions";
import { config } from "../config";
import { exportRecordPdf } from "../export/pdf";
import { ingestInputWithOptions } from "../ingest";
import type { IngestedSource } from "../types";
import { buildRecord } from "../normalize/normalizeInput";
import { ensureDatabase, fetchRecentRecords, fetchRecordById, searchRecords, updateRecordCurationStatus } from "../storage/db";
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

  if (parsed.action === "curate" && parsed.curationOptions) {
    return handleCurationUpdate(parsed);
  }

  if (parsed.action === "queue") {
    return handleQueueWorkflow(parsed);
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

async function handleQueueWorkflow(parsed: ParsedCommand): Promise<ActionArtifacts> {
  logInfo("ingest_started", { action: "queue" });
  const ingested = await ingestInputWithOptions(parsed.input!, {
    analysisMode: parsed.analysisMode
  });
  logInfo("ingest_completed", {
    action: "queue",
    sourceType: ingested.sourceType,
    completeness: ingested.completeness
  });

  const sharedMetadata = {
    userIntent: parsed.rawRequest,
    intentLabel: parsed.intentLabel,
    contextNote: parsed.contextNote,
    requestedFocus: parsed.requestedFocus,
    analysisMode: parsed.analysisMode,
    compoundWorkflow: "analyze_and_draft"
  };

  const analysisRecord = buildRecord("summarize", ingested, {
    metadata: sharedMetadata,
    tags: [...(parsed.requestedFocus ?? []), "compound_workflow", "analysis_stage"]
  });

  logInfo("action_started", {
    action: "summarize",
    recordId: analysisRecord.id,
    intentLabel: parsed.intentLabel
  });
  const analysisResult = await runAction("summarize", { record: analysisRecord });
  await updateRecordCurationStatus(analysisRecord.id, "reviewed");

  const mdxIngested = buildDraftIngestedSource(ingested, analysisResult.output);
  const draftRecord = buildRecord("mdx", mdxIngested, {
    metadata: {
      ...sharedMetadata,
      sourceRecordId: analysisRecord.id,
      sourceRecordAction: "summarize"
    },
    tags: [...(parsed.requestedFocus ?? []), "compound_workflow", "draft_stage"]
  });

  logInfo("action_started", {
    action: "mdx",
    recordId: draftRecord.id,
    intentLabel: parsed.intentLabel
  });
  const draftResult = await runAction("mdx", { record: draftRecord });
  await updateRecordCurationStatus(draftRecord.id, "drafted");

  return {
    reply: [
      "Compound workflow completed.",
      `Analysis record: ${analysisRecord.id} (reviewed)`,
      `Draft record: ${draftRecord.id} (drafted)`,
      extractMdxSummary(draftResult.reply)
    ].join("\n\n"),
    output: draftResult.output,
    savedPaths: [...analysisResult.savedPaths, ...draftResult.savedPaths],
    recordId: draftRecord.id
  };
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
        `Curation status: ${record.curationStatus ?? "new"}`,
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
      sourceType: parsed.retrievalOptions?.sourceType,
      curationStatus: parsed.retrievalOptions?.curationStatus
    });

    if (matches.length === 0) {
      return {
        reply: `No saved analyses matched "${query}"${parsed.retrievalOptions?.sourceType ? ` in ${parsed.retrievalOptions.sourceType}` : ""}.`,
        output: `No saved analyses matched "${query}".`,
        savedPaths: []
      };
    }

    const lines = matches.map((item) =>
      `- ${item.id} | ${item.curationStatus} | ${item.sourceType} | ${item.requestedAction} | ${item.title ?? "Untitled"} | ${item.createdAt}`
    );

    return {
      reply: [
        `Search results for "${query}"${formatListFilters(parsed)}:`,
        ...lines
      ].join("\n"),
      output: lines.join("\n"),
      savedPaths: []
    };
  }

  const recent = await fetchRecentRecords({
    limit: parsed.retrievalOptions?.limit,
    sourceType: parsed.retrievalOptions?.sourceType,
    curationStatus: parsed.retrievalOptions?.curationStatus
  });

  if (recent.length === 0) {
    return {
      reply: "No saved analyses found for that filter yet.",
      output: "No saved analyses found for that filter yet.",
      savedPaths: []
    };
  }

  const lines = recent.map((item) =>
    `- ${item.id} | ${item.curationStatus} | ${item.sourceType} | ${item.requestedAction} | ${item.title ?? "Untitled"} | ${item.createdAt}`
  );

  return {
    reply: [
      `Recent saved analyses${formatListFilters(parsed)}:`,
      ...lines
    ].join("\n"),
    output: lines.join("\n"),
    savedPaths: []
  };
}

async function handleCurationUpdate(parsed: ParsedCommand): Promise<ActionArtifacts> {
  const recordId = parsed.curationOptions!.recordId;
  const status = parsed.curationOptions!.status;
  const updated = await updateRecordCurationStatus(recordId, status);

  if (!updated) {
    throw new AppError(`No saved analysis found for record ID ${recordId}.`);
  }

  return {
    reply: [
      "Curation status updated.",
      `Record ID: ${updated.id}`,
      `Title: ${updated.title ?? "Untitled"}`,
      `Status: ${updated.curationStatus}`
    ].join("\n"),
    output: updated.curationStatus,
    savedPaths: [],
    recordId: updated.id
  };
}

function formatListFilters(parsed: ParsedCommand): string {
  const filters: string[] = [];
  if (parsed.retrievalOptions?.sourceType) {
    filters.push(parsed.retrievalOptions.sourceType);
  }
  if (parsed.retrievalOptions?.curationStatus) {
    filters.push(parsed.retrievalOptions.curationStatus);
  }

  return filters.length > 0 ? ` (${filters.join(", ")})` : "";
}

function isRetrievalAction(action: AppAction | undefined): action is "retrieve" | "recent" | "search" {
  return action === "retrieve" || action === "recent" || action === "search";
}

function buildDraftIngestedSource(ingested: IngestedSource, analysisOutput: string): IngestedSource {
  return {
    ...ingested,
    normalizedText: `${ingested.normalizedText}\n\nSaved analysis:\n${analysisOutput}`,
    metadata: {
      ...(ingested.metadata ?? {}),
      derivedFromAnalysis: true
    },
    tags: [...new Set([...(ingested.tags ?? []), "derived_from_analysis"])]
  };
}

function extractMdxSummary(reply: string): string {
  const lines = reply
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const kept = lines.filter(
    (line) =>
      line === "MDX draft created." ||
      line.startsWith("title:") ||
      line.startsWith("dek:") ||
      line.startsWith("Saved MDX:") ||
      line.startsWith("GitHub draft sync:")
  );

  return kept.join("\n");
}
