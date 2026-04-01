import { config } from "../config";
import { buildHash } from "../storage/hashes";
import { slugify } from "../storage/slugify";
import { isoNow } from "../utils/dates";
import type { CanonicalAction, IngestedSource, NormalizedRecord, SourceType } from "../types";

export function classifyInput(input: string): SourceType {
  const trimmed = input.trim();

  if (/^(https?:\/\/)/i.test(trimmed)) {
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

  if (/(transcript|speaker 1|speaker 2|\[music\]|\[applause\])/i.test(trimmed)) {
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

export function buildRecord(
  action: CanonicalAction,
  ingested: IngestedSource,
  extras?: {
    metadata?: Record<string, unknown>;
    tags?: string[];
  }
): NormalizedRecord {
  const createdAt = isoNow();
  const id = buildHash(`${action}:${ingested.sourceReference}:${ingested.normalizedText}`);
  const slug = slugify(ingested.title ?? ingested.sourceReference ?? "research-note");

  return {
    id,
    slug,
    sourceType: ingested.sourceType,
    sourceReference: ingested.sourceReference,
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
