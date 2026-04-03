import { config } from "../config";
import { buildHash } from "../storage/hashes";
import { normalizeSourceReference } from "../storage/sourceReferences";
import { slugify } from "../storage/slugify";
import { isoNow } from "../utils/dates";
import type { CanonicalAction, IngestedSource, NormalizedRecord, SourceType } from "../types";

export function classifyInput(input: string): SourceType {
  const trimmed = input.trim();

  if (/^(https?:\/\/)/i.test(trimmed)) {
    if (/\.pdf(?:[?#].*)?$/i.test(trimmed)) {
      return "pdf_document";
    }

    if (/pubmed\.ncbi\.nlm\.nih\.gov/i.test(trimmed)) {
      return "pubmed";
    }

    if (/(youtube\.com|youtu\.be)/i.test(trimmed)) {
      return "transcript";
    }

    if (/(nejm|jamanetwork|thelancet|bmj|nature|science|medrxiv|biorxiv)/i.test(trimmed)) {
      return "research_article";
    }

    return "webpage";
  }

  if (/^(PMID:\s*)?\d{5,12}$/i.test(trimmed)) {
    return "pubmed";
  }

  if (/^(?:[a-z]:\\|\\\\|\.{0,2}[\\/]).+\.pdf$/i.test(trimmed) || /^[^?\n]+\.pdf$/i.test(trimmed)) {
    return "pdf_document";
  }

  if (looksLikeTranscript(trimmed)) {
    return "transcript";
  }

  if (/(dictated|voice memo|audio note|spoken note)/i.test(trimmed)) {
    return "audio_transcript";
  }

  if (trimmed.length > 0) {
    return "text";
  }

  return "unknown";
}

function looksLikeTranscript(input: string): boolean {
  if (!input) {
    return false;
  }

  if (/(^|\n)\s*(transcript|speaker 1|speaker 2|speaker:|interviewer:|host:|patient:|doctor:|\[music\]|\[applause\])/i.test(input)) {
    return true;
  }

  const lines = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 3) {
    return false;
  }

  const speakerPattern = /^(?:[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2}|Speaker\s*\d+|Dr\.?\s+[A-Z][A-Za-z]+|Patient|Host|Moderator|Interviewer)\s*:\s+/;
  const timestampPattern = /^(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?|\d{1,2}:\d{2}(?::\d{2})?\s+-)\s*/;
  const transcriptLikeLines = lines.filter((line) => speakerPattern.test(line) || timestampPattern.test(line));
  if (transcriptLikeLines.length >= Math.max(3, Math.ceil(lines.length * 0.3))) {
    return true;
  }

  const conversationalLines = lines.filter((line) => {
    const wordCount = line.split(/\s+/).length;
    return wordCount >= 4 && wordCount <= 40 && !/[.!?]$/.test(line);
  });

  return conversationalLines.length >= Math.max(4, Math.ceil(lines.length * 0.5));
}

export function buildRecord(
  action: CanonicalAction,
  ingested: IngestedSource,
  extras?: {
    metadata?: Record<string, unknown>;
    tags?: string[];
  }
): NormalizedRecord {
  const createdAt = isoNow();
  const sourceReference = normalizeSourceReference(ingested.sourceReference);
  const id = buildHash(`${action}:${sourceReference}:${ingested.normalizedText}`);
  const slug = slugify(ingested.title ?? sourceReference ?? "research-note");

  return {
    id,
    slug,
    sourceType: ingested.sourceType,
    sourceReference,
    rawInput: ingested.rawInput,
    normalizedText: ingested.normalizedText,
    title: ingested.title,
    authors: ingested.authors ?? [],
    publication: ingested.publication,
    date: ingested.date,
    completeness: ingested.completeness,
    requestedAction: action,
    tags: [...new Set([...(ingested.tags ?? []), ...(extras?.tags ?? [])])],
    createdAt,
    model: config.openAiModel,
    status: "processed",
    metadata: {
      ...(ingested.metadata ?? {}),
      ...(extras?.metadata ?? {})
    }
  };
}
