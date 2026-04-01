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
    reply: [
      "Archived successfully.",
      "",
      archivalNote,
      "",
      `Saved record: ${paths.recordJsonPath}`,
      `Saved source: ${archivePath}`,
      `Saved note: ${paths.summaryMarkdownPath}`,
      `Canonical record ID: ${record.id}`
    ].join("\n"),
    output: archivalNote,
    savedPaths,
    recordId: record.id
  };

  await persistCanonicalResult({ record, result });

  return result;
}
