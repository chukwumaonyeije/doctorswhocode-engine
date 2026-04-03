import type { NormalizedRecord } from "../types";
import { buildSourceProvenanceLines } from "./provenance";

export function renderSourceMarkdown(record: NormalizedRecord): string {
  const authors = record.authors.length > 0 ? record.authors.join(", ") : "Unknown";
  const provenanceLines = buildSourceProvenanceLines(record);

  return [
    `# ${record.title ?? "Untitled Source"}`,
    "",
    `- Source type: ${record.sourceType}`,
    `- Source reference: ${record.sourceReference}`,
    `- Requested action: ${record.requestedAction}`,
    `- Completeness: ${record.completeness}`,
    `- Publication: ${record.publication ?? "Unknown"}`,
    `- Authors: ${authors}`,
    `- Date: ${record.date ?? "Unknown"}`,
    `- Created at: ${record.createdAt}`,
    ...(provenanceLines.length > 0 ? ["", ...provenanceLines] : []),
    "",
    "## Normalized Text",
    "",
    record.normalizedText
  ].join("\n");
}
