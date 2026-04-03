import { slugify } from "../storage/slugify";
import type { NormalizedRecord } from "../types";

export interface RenderedMdxDraft {
  document: string;
  title: string;
  slug: string;
  description: string;
  tags: string[];
}

export function renderMdxDocument(record: NormalizedRecord, body: string): RenderedMdxDraft {
  const parsed = parseGeneratedMdx(body);
  const tags = normalizeTags(parsed.tags, record);
  const title = normalizeMetadataText(parsed.articleTitle) ?? normalizeMetadataText(record.title) ?? "Research Insight";
  const description = normalizeDescription(normalizeMetadataText(parsed.dek) ?? buildFallbackDescription(record));
  const cleanedBody = normalizeBodyShape(stripDuplicateLeadingHeading(parsed.body.trim(), title), title);
  const publishDate = normalizePublishDate(record.createdAt);
  const slug = buildPublishSlug(title, record.slug);
  const sourceTitle = normalizeMetadataText(record.title);
  const publication = normalizeMetadataText(record.publication);
  const authors = normalizeAuthorList(record.authors);
  const sourceDomain = extractSourceDomain(record.sourceReference);

  const document = [
    "---",
    `title: "${escapeQuotes(title)}"`,
    `slug: "${slug}"`,
    `description: "${escapeQuotes(description)}"`,
    `pubDate: "${publishDate}"`,
    `author: "Chukwuma Onyeije, MD, FACOG"`,
    `draft: true`,
    `recordId: "${record.id}"`,
    `tags: [${tags.map((tag) => `"${escapeQuotes(tag)}"`).join(", ")}]`,
    `sourceType: "${record.sourceType}"`,
    `sourceReference: "${escapeQuotes(record.sourceReference)}"`,
    ...(sourceDomain ? [`sourceDomain: "${escapeQuotes(sourceDomain)}"`] : []),
    ...(sourceTitle ? [`sourceTitle: "${escapeQuotes(sourceTitle)}"`] : []),
    ...(authors.length > 0 ? [`sourceAuthors: [${authors.map((author) => `"${escapeQuotes(author)}"`).join(", ")}]`] : []),
    ...(publication ? [`publication: "${escapeQuotes(publication)}"`] : []),
    `completeness: "${record.completeness}"`,
    "---",
    "",
    cleanedBody,
    ""
  ].join("\n");

  return {
    document,
    title,
    slug,
    description,
    tags
  };
}

function escapeQuotes(value: string): string {
  return value.replace(/"/g, '\\"');
}

function parseGeneratedMdx(body: string): {
  articleTitle?: string;
  dek?: string;
  tags: string[];
  body: string;
} {
  const trimmed = body.trim();
  const metadataMatch = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!metadataMatch) {
    return {
      tags: [],
      body: trimmed
    };
  }

  const metadata = metadataMatch[1];
  const articleTitle = extractMetadataValue(metadata, "articleTitle");
  const dek = extractMetadataValue(metadata, "dek");
  const tags = extractMetadataTags(metadata);

  return {
    articleTitle,
    dek,
    tags,
    body: metadataMatch[2].trim()
  };
}

function extractMetadataValue(metadata: string, key: string): string | undefined {
  const regex = new RegExp(`^${key}:\\s*(.+)$`, "mi");
  const match = metadata.match(regex);
  return normalizeMetadataText(match?.[1]);
}

function extractMetadataTags(metadata: string): string[] {
  const match = metadata.match(/^tags:\s*\n((?:\s*-\s+.+\n?)*)/mi);
  if (!match) {
    return [];
  }

  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("-"))
    .map((line) => normalizeMetadataText(line.replace(/^-+\s*/, "").trim()))
    .filter((line): line is string => Boolean(line));
}

function normalizeMetadataText(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  const unquoted = trimmed.replace(/^["'`]+|["'`]+$/g, "");
  const withoutMarkdown = unquoted.replace(/^\*\*(.+)\*\*$/g, "$1").trim();
  return withoutMarkdown || undefined;
}

function normalizeTags(tags: string[], record: NormalizedRecord): string[] {
  const preferred = tags.length > 0 ? tags : buildFallbackTags(record);
  const normalized = preferred
    .map((tag) => normalizeMetadataText(tag) ?? "")
    .map((tag) => tag.toLowerCase())
    .map((tag) => tag.replace(/[^a-z0-9]+/g, "-"))
    .map((tag) => tag.replace(/^-+|-+$/g, ""))
    .filter((tag) => !INTERNAL_TAGS.has(tag))
    .filter(Boolean);

  const deduped = [...new Set(normalized)];
  if (deduped.length > 0) {
    return deduped.slice(0, 5);
  }

  return ["research", "physician-builder"];
}

function buildFallbackDescription(record: NormalizedRecord): string {
  const sourceLabel = normalizeMetadataText(record.title) ?? record.publication ?? record.sourceReference;
  const sourceContext =
    record.sourceType === "pubmed"
      ? "PubMed review"
      : record.sourceType === "transcript" || record.sourceType === "audio_transcript"
        ? "transcript-driven analysis"
        : `${record.sourceType} analysis`;

  return `${sourceContext} for physician-builders drawn from ${sourceLabel}`.slice(0, 180);
}

function normalizeDescription(value: string): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 180) {
    return singleLine;
  }

  return `${singleLine.slice(0, 177).trim()}...`;
}

function stripDuplicateLeadingHeading(body: string, title: string): string {
  const lines = body.split("\n");
  const firstLine = lines[0]?.trim() ?? "";
  const firstHeadingMatch = firstLine.match(/^#\s+(.+)$/);
  if (!firstHeadingMatch) {
    return body;
  }

  const headingText = normalizeHeading(firstHeadingMatch[1]);
  const titleText = normalizeHeading(title);
  if (!headingText || headingText !== titleText) {
    return body;
  }

  const remaining = lines.slice(1);
  if (remaining[0]?.trim() === "") {
    remaining.shift();
  }

  return remaining.join("\n").trim();
}

function normalizeBodyShape(body: string, title: string): string {
  const withoutLeadingMetadata = stripLeadingMetadataLikeBlock(body);
  const withoutLeadingLabels = stripLeadingMetadataLabels(withoutLeadingMetadata, title);
  return promotePlainSectionLabels(withoutLeadingLabels);
}

function stripLeadingMetadataLikeBlock(body: string): string {
  const trimmed = body.trim();
  const metadataMatch = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!metadataMatch) {
    return trimmed;
  }

  const metadata = metadataMatch[1];
  const lines = metadata
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const metadataKeys = [
    "id:",
    "sourcetype:",
    "sourcereference:",
    "sourcetitle:",
    "authors:",
    "publication:",
    "date:",
    "completeness:",
    "tags:",
    "createdat:",
    "userintent:",
    "intentlabel:",
    "articletitle:",
    "dek:"
  ];
  const metadataLikeLines = lines.filter((line) => metadataKeys.some((key) => line.toLowerCase().startsWith(key)));
  if (metadataLikeLines.length < 3) {
    return trimmed;
  }

  return metadataMatch[2].trim();
}

function stripLeadingMetadataLabels(body: string, title: string): string {
  const lines = body.split("\n");
  const cleaned: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (trimmed === "") {
      index += 1;
      continue;
    }

    const metadataLabel = parseLeadingMetadataLabel(trimmed);
    if (!metadataLabel) {
      break;
    }

    const normalizedValue = normalizeMetadataText(metadataLabel.value) ?? "";
    const normalizedTitle = normalizeHeading(title);
    const duplicateTitle = metadataLabel.key === "title" && normalizeHeading(normalizedValue) === normalizedTitle;
    const safeToDrop =
      duplicateTitle ||
      metadataLabel.key === "dek" ||
      metadataLabel.key === "source" ||
      metadataLabel.key === "record" ||
      metadataLabel.key === "tags";
    if (!safeToDrop) {
      break;
    }

    index += 1;
  }

  cleaned.push(...lines.slice(index));
  return cleaned.join("\n").trim();
}

function parseLeadingMetadataLabel(line: string): { key: string; value: string } | undefined {
  const match = line.match(/^(Title|Dek|Source|Record|Tags):\s*(.+)$/i);
  if (!match) {
    return undefined;
  }

  return {
    key: match[1].toLowerCase(),
    value: match[2]
  };
}

function promotePlainSectionLabels(body: string): string {
  const lines = body.split("\n");
  const normalizedLines = [...lines];

  for (let index = 0; index < normalizedLines.length; index += 1) {
    const current = normalizedLines[index].trim();
    if (!isPromotableSectionLabel(current)) {
      continue;
    }

    const previous = findPreviousNonEmptyLine(normalizedLines, index);
    const next = findNextNonEmptyLine(normalizedLines, index);
    if (!next || looksLikeHeading(previous) || looksLikeHeading(next)) {
      continue;
    }

    normalizedLines[index] = `## ${current}`;
  }

  return normalizedLines.join("\n").trim();
}

function isPromotableSectionLabel(line: string): boolean {
  if (!line) {
    return false;
  }

  if (
    line.startsWith("#") ||
    line.startsWith("-") ||
    line.startsWith("*") ||
    line.startsWith(">") ||
    line.startsWith("```") ||
    /^\d+[.)]\s/.test(line)
  ) {
    return false;
  }

  if (/[.!?]$/.test(line)) {
    return false;
  }

  const words = line.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 8 || line.length > 80) {
    return false;
  }

  if (!/[a-z]/i.test(line)) {
    return false;
  }

  return true;
}

function findPreviousNonEmptyLine(lines: string[], index: number): string | undefined {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const value = lines[cursor].trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function findNextNonEmptyLine(lines: string[], index: number): string | undefined {
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const value = lines[cursor].trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function looksLikeHeading(line?: string): boolean {
  return Boolean(line && /^#+\s+/.test(line.trim()));
}

function normalizeHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePublishDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString().slice(0, 10);
}

const INTERNAL_TAGS = new Set([
  "publishable-output",
  "mdx-from-record",
  "derived-from-analysis",
  "compound-workflow",
  "analysis-stage",
  "draft-stage"
]);

function buildFallbackTags(record: NormalizedRecord): string[] {
  return [
    ...record.tags,
    mapSourceTypeTag(record.sourceType),
    mapCompletenessTag(record.completeness),
    record.publication ? "clinical-evidence" : "",
    "physician-builder"
  ].filter(Boolean);
}

function mapSourceTypeTag(sourceType: NormalizedRecord["sourceType"]): string {
  switch (sourceType) {
    case "pubmed":
      return "pubmed";
    case "research_article":
      return "research";
    case "transcript":
    case "audio_transcript":
      return "transcript-analysis";
    case "webpage":
      return "web-research";
    default:
      return sourceType;
  }
}

function mapCompletenessTag(completeness: NormalizedRecord["completeness"]): string {
  switch (completeness) {
    case "full_text":
      return "full-text";
    case "abstract_only":
      return "abstract-review";
    case "transcript_only":
      return "transcript-review";
    case "partial":
      return "partial-evidence";
    default:
      return "source-aware";
  }
}

function buildPublishSlug(title: string, fallbackSlug: string): string {
  const generated = slugify(title);
  return generated || fallbackSlug;
}

function normalizeAuthorList(authors: string[]): string[] {
  return authors
    .map((author) => normalizeMetadataText(author) ?? "")
    .map((author) => author.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 6);
}

function extractSourceDomain(sourceReference: string): string | undefined {
  if (!/^https?:\/\//i.test(sourceReference)) {
    return undefined;
  }

  try {
    return new URL(sourceReference).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}
