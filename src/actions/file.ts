import { renderSourceMarkdown } from "../render/markdown";
import { buildRecordPaths, writeJsonFile, writeTextFile } from "../storage/fs";
import { persistCanonicalResult } from "../storage/recordStore";
import type { ActionArtifacts, ActionContext } from "../types";
import { generateActionOutput } from "./shared";

export async function runFileAction({ record }: ActionContext): Promise<ActionArtifacts> {
  const archivalNote = await generateActionOutput("file", record);
  const paths = buildRecordPaths(record);
  const archivePath =
    record.sourceType === "transcript" || record.sourceType === "audio_transcript"
      ? paths.transcriptMarkdownPath
      : paths.sourceMarkdownPath;

  const savedPaths = await Promise.all([
    writeJsonFile(paths.recordJsonPath, record),
    writeTextFile(archivePath, renderSourceMarkdown(record)),
    writeTextFile(paths.summaryMarkdownPath, archivalNote)
  ]);

  const result = {
    reply: buildFileReply({
      recordId: record.id,
      title: record.title,
      sourceType: record.sourceType,
      sourceReference: record.sourceReference,
      notePath: paths.summaryMarkdownPath
    }),
    output: archivalNote,
    savedPaths,
    recordId: record.id
  };

  await persistCanonicalResult({ record, result });

  return result;
}

function buildFileReply(params: {
  recordId: string;
  title?: string;
  sourceType: string;
  sourceReference: string;
  notePath: string;
}): string {
  const titleLine = params.title?.trim() ? `Title: ${params.title.trim()}` : "Title: Untitled";

  return [
    "Archived successfully.",
    titleLine,
    `Source type: ${params.sourceType}`,
    `Source: ${shortenSourceReference(params.sourceReference)}`,
    `Record ID: ${params.recordId}`,
    `Saved note: ${params.notePath}`
  ].join("\n");
}

function shortenSourceReference(sourceReference: string): string {
  if (sourceReference.length <= 120) {
    return sourceReference;
  }

  return `${sourceReference.slice(0, 117)}...`;
}
