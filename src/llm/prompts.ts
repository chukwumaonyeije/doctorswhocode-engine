import fs from "fs/promises";
import path from "path";
import type { CanonicalAction, NormalizedRecord } from "../types";

const promptCache = new Map<CanonicalAction, string>();

export async function loadPrompt(action: CanonicalAction): Promise<string> {
  if (promptCache.has(action)) {
    return promptCache.get(action)!;
  }

  const filePath = path.resolve(process.cwd(), "prompts", `${action}.md`);
  const contents = await fs.readFile(filePath, "utf8");
  promptCache.set(action, contents);
  return contents;
}

export async function buildActionPrompt(action: CanonicalAction, record: NormalizedRecord): Promise<string> {
  const basePrompt = await loadPrompt(action);
  const serializedRecord = JSON.stringify(
    {
      id: record.id,
      sourceType: record.sourceType,
      sourceReference: record.sourceReference,
      title: record.title,
      authors: record.authors,
      publication: record.publication,
      date: record.date,
      completeness: record.completeness,
      tags: record.tags,
      createdAt: record.createdAt,
      userIntent: record.metadata.userIntent,
      intentLabel: record.metadata.intentLabel,
      contextNote: record.metadata.contextNote,
      requestedFocus: record.metadata.requestedFocus
    },
    null,
    2
  );

  return [
    basePrompt.trim(),
    "",
    "Record metadata:",
    serializedRecord,
    "",
    "Normalized source text:",
    record.normalizedText
  ].join("\n");
}
