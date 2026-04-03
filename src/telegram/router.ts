import { runAction } from "../actions";
import { config } from "../config";
import { exportRecordPdf } from "../export/pdf";
import { ingestInputWithOptions } from "../ingest";
import type { IngestedSource } from "../types";
import { buildRecord } from "../normalize/normalizeInput";
import {
  ensureDatabase,
  fetchQueueRecords,
  fetchRecentRecords,
  fetchRecordById,
  fetchRecordBySourceReference,
  searchRecords,
  updateRecordCurationStatus
} from "../storage/db";
import { ensureStorageStructure } from "../storage/fs";
import type { ActionArtifacts, AppAction, CanonicalAction, ParsedCommand } from "../types";
import { AppError } from "../utils/errors";
import { createRequestId, logInfo } from "../utils/logging";
import { parseCommand } from "./parseCommand";

export async function handleIncomingText(text: string): Promise<ActionArtifacts> {
  const parsed = parseCommand(text);
  parsed.requestId = parsed.requestId ?? createRequestId("ingest");
  return handleParsedCommand(parsed);
}

export async function handleIngestedSourceAction(params: {
  action: CanonicalAction;
  ingested: IngestedSource;
  requestId?: string;
  rawRequest?: string;
  intentLabel?: string;
  contextNote?: string;
  requestedFocus?: string[];
  analysisMode?: "default" | "youtube_fast" | "youtube_deep";
}): Promise<ActionArtifacts> {
  await ensureStorageStructure();
  await ensureDatabase();

  const record = buildRecord(params.action, params.ingested, {
    metadata: {
      userIntent: params.rawRequest,
      intentLabel: params.intentLabel,
      contextNote: params.contextNote,
      requestedFocus: params.requestedFocus,
      analysisMode: params.analysisMode
    },
    tags: params.requestedFocus ?? []
  });

  logInfo("action_started", {
    requestId: params.requestId,
    action: params.action,
    recordId: record.id,
    intentLabel: params.intentLabel
  });

  return runAction(params.action, { record });
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
  const requestId = parsed.requestId;

  logInfo("ingest_started", { requestId, action, intentLabel: parsed.intentLabel });
  const ingested = await ingestInputWithOptions(parsed.input, {
    analysisMode: parsed.analysisMode,
    requestId
  });
  logInfo("ingest_completed", {
    requestId,
    action,
    sourceType: ingested.sourceType,
    completeness: ingested.completeness
  });
  return handleIngestedSourceAction({
    action,
    ingested,
    requestId,
    rawRequest: parsed.rawRequest,
    intentLabel: parsed.intentLabel,
    contextNote: parsed.contextNote,
    requestedFocus: parsed.requestedFocus,
    analysisMode: parsed.analysisMode
  });
}

async function handleQueueWorkflow(parsed: ParsedCommand): Promise<ActionArtifacts> {
  const requestId = parsed.requestId;

  logInfo("ingest_started", { requestId, action: "queue", intentLabel: parsed.intentLabel });
  const ingested = await ingestInputWithOptions(parsed.input!, {
    analysisMode: parsed.analysisMode,
    requestId
  });
  logInfo("ingest_completed", {
    requestId,
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
    requestId,
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
    requestId,
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
      | "pdf_document"
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
    const record =
      parsed.intentLabel === "source_retrieval"
        ? await fetchRecordBySourceReference(parsed.input!)
        : await fetchRecordById(parsed.input!);
    if (!record) {
      throw new AppError(
        parsed.intentLabel === "source_retrieval"
          ? `No saved analysis found for source ${parsed.input}.`
          : `No saved analysis found for record ID ${parsed.input}.`
      );
    }

    return {
      reply: [
        `Saved analysis: ${record.id}`,
        `Title: ${record.title ?? "Untitled"}`,
        `Curation status: ${record.curationStatus ?? "new"}`,
        `Source type: ${record.sourceType}`,
        `Source reference: ${record.sourceReference ?? "Unknown"}`,
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
      topics: parsed.retrievalOptions?.topics,
      createdAfter: parsed.retrievalOptions?.createdAfter,
      createdBefore: parsed.retrievalOptions?.createdBefore,
      curationStatus: parsed.retrievalOptions?.curationStatus
    });

    if (matches.length === 0) {
      return {
        reply: `No saved analyses matched "${query}"${parsed.retrievalOptions?.sourceType ? ` in ${parsed.retrievalOptions.sourceType}` : ""}.`,
        output: `No saved analyses matched "${query}".`,
        savedPaths: []
      };
    }

    const lines = matches.flatMap((item) => {
      const summaryLine = `- ${item.id} | ${item.curationStatus} | ${item.sourceType} | ${item.requestedAction} | ${item.title ?? "Untitled"} | ${item.createdAt}`;
      const preview = formatSearchPreview(item.matchPreview, item.sourceType);
      return preview ? [summaryLine, `  Match: ${preview}`] : [summaryLine];
    });

    return {
      reply: [
        `Search results for "${query}"${formatListFilters(parsed)}:`,
        ...lines
      ].join("\n"),
      output: lines.join("\n"),
      savedPaths: []
    };
  }

  if (parsed.action === "queue_view") {
    const queued = await fetchQueueRecords({
      limit: parsed.retrievalOptions?.limit,
      sourceType: parsed.retrievalOptions?.sourceType,
      topics: parsed.retrievalOptions?.topics,
      createdAfter: parsed.retrievalOptions?.createdAfter,
      createdBefore: parsed.retrievalOptions?.createdBefore,
      curationStatuses: parsed.retrievalOptions?.curationStatuses,
      queueSort: parsed.retrievalOptions?.queueSort
    });

    if (queued.length === 0) {
      return {
        reply: "No records are currently in that queue.",
        output: "No records are currently in that queue.",
        savedPaths: []
      };
    }

    const lines = queued.map((item) =>
      `- ${item.id} | ${item.curationStatus} | ${item.ageDays}d | ${item.sourceType} | ${item.requestedAction} | ${item.title ?? "Untitled"} | ${item.createdAt}`
    );

    return {
      reply: [
        `Editorial queue${formatQueueFilters(parsed)}:`,
        ...lines
      ].join("\n"),
      output: lines.join("\n"),
      savedPaths: []
    };
  }

  const recent = await fetchRecentRecords({
    limit: parsed.retrievalOptions?.limit,
    sourceType: parsed.retrievalOptions?.sourceType,
    topics: parsed.retrievalOptions?.topics,
    createdAfter: parsed.retrievalOptions?.createdAfter,
    createdBefore: parsed.retrievalOptions?.createdBefore,
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
  if (parsed.retrievalOptions?.topics?.length) {
    filters.push(`topic:${parsed.retrievalOptions.topics.join("|")}`);
  }
  if (parsed.retrievalOptions?.createdAfter) {
    filters.push(`after:${parsed.retrievalOptions.createdAfter}`);
  }
  if (parsed.retrievalOptions?.createdBefore) {
    filters.push(`before:${parsed.retrievalOptions.createdBefore}`);
  }

  return filters.length > 0 ? ` (${filters.join(", ")})` : "";
}

function formatQueueFilters(parsed: ParsedCommand): string {
  const filters: string[] = [];
  if (parsed.retrievalOptions?.sourceType) {
    filters.push(parsed.retrievalOptions.sourceType);
  }
  if (parsed.retrievalOptions?.curationStatuses?.length) {
    filters.push(parsed.retrievalOptions.curationStatuses.join(", "));
  }
  if (parsed.retrievalOptions?.queueSort) {
    filters.push(`sort:${parsed.retrievalOptions.queueSort}`);
  }
  if (parsed.retrievalOptions?.topics?.length) {
    filters.push(`topic:${parsed.retrievalOptions.topics.join("|")}`);
  }
  if (parsed.retrievalOptions?.createdAfter) {
    filters.push(`after:${parsed.retrievalOptions.createdAfter}`);
  }
  if (parsed.retrievalOptions?.createdBefore) {
    filters.push(`before:${parsed.retrievalOptions.createdBefore}`);
  }

  return filters.length > 0 ? ` (${filters.join(" | ")})` : "";
}

function isRetrievalAction(action: AppAction | undefined): action is "retrieve" | "recent" | "search" | "queue_view" {
  return action === "retrieve" || action === "recent" || action === "search" || action === "queue_view";
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

function formatSearchPreview(value: string | null | undefined, sourceType?: string): string | null {
  if (!value) {
    return null;
  }

  const compact = sanitizeSearchPreview(value);
  if (!compact) {
    return null;
  }

  if (sourceType === "pdf_document" && !looksLikeReadablePdfPreview(compact)) {
    return null;
  }

  if (compact.length <= 180) {
    return compact;
  }

  return `${compact.slice(0, 177).trim()}...`;
}

function sanitizeSearchPreview(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeReadablePdfPreview(value: string): boolean {
  if (looksLikeSourceReferencePreview(value)) {
    return true;
  }

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 6) {
    return true;
  }

  const noisyWordCount = words.filter((word) => /[^A-Za-z0-9,.;:()'"%/-]/.test(word)).length;
  const punctuationRuns = (value.match(/[^\w\s]{3,}/g) ?? []).length;
  const spacedLetterRuns = (value.match(/\b(?:[A-Za-z]\s){3,}[A-Za-z]\b/g) ?? []).length;
  const shortWordCount = words.filter((word) => word.length <= 2).length;

  if (noisyWordCount >= Math.ceil(words.length * 0.2)) {
    return false;
  }

  if (punctuationRuns > 0 || spacedLetterRuns > 0) {
    return false;
  }

  if (shortWordCount >= Math.ceil(words.length * 0.45)) {
    return false;
  }

  return true;
}

function looksLikeSourceReferencePreview(value: string): boolean {
  return /^(upload:|https?:\/\/|PMID:|[A-Za-z]:\\|\\\\)/i.test(value);
}
