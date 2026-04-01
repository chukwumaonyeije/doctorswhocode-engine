import type { NormalizedRecord } from "../types";

export function renderMdxDocument(record: NormalizedRecord, body: string): string {
  const tags = record.tags.length > 0 ? record.tags : ["research", "physician-builder"];
  const title = record.title ?? "Research Insight";
  const description = `${record.sourceType} sourced draft derived from ${record.sourceReference}`;

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
    body.trim(),
    ""
  ].join("\n");
}

function escapeQuotes(value: string): string {
  return value.replace(/"/g, '\\"');
}
