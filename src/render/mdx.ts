import type { NormalizedRecord } from "../types";

export function renderMdxDocument(record: NormalizedRecord, body: string): string {
  const parsed = parseGeneratedMdx(body);
  const tags = parsed.tags.length > 0 ? parsed.tags : record.tags.length > 0 ? record.tags : ["research", "physician-builder"];
  const title = parsed.articleTitle ?? record.title ?? "Research Insight";
  const description =
    parsed.dek ?? `${record.sourceType} sourced draft derived from ${record.sourceReference}`;

  return [
    "---",
    `title: "${escapeQuotes(title)}"`,
    `slug: "${record.slug}"`,
    `description: "${escapeQuotes(description)}"`,
    `pubDate: "${record.createdAt}"`,
    `tags: [${tags.map((tag) => `"${escapeQuotes(tag)}"`).join(", ")}]`,
    `sourceType: "${record.sourceType}"`,
    `sourceReference: "${escapeQuotes(record.sourceReference)}"`,
    `completeness: "${record.completeness}"`,
    "---",
    "",
    parsed.body.trim(),
    ""
  ].join("\n");
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
  return match?.[1]?.trim();
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
    .map((line) => line.replace(/^-+\s*/, "").trim())
    .filter(Boolean);
}
