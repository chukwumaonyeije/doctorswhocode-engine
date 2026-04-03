import { renderSourceMarkdown } from "../render/markdown";
import { buildCompactProvenanceBlock } from "../render/provenance";
import { buildRecordPaths, writeJsonFile, writeTextFile } from "../storage/fs";
import { persistCanonicalResult } from "../storage/recordStore";
import type { ActionArtifacts, ActionContext } from "../types";
import { generateActionOutput } from "./shared";

export async function runDigestAction({ record }: ActionContext): Promise<ActionArtifacts> {
  const output = await generateActionOutput("digest", record);
  const paths = buildRecordPaths(record);
  const provenanceBlock = buildCompactProvenanceBlock(record);
  const reply = provenanceBlock ? `${provenanceBlock}\n\n${output}` : output;

  const savedPaths = await Promise.all([
    writeJsonFile(paths.recordJsonPath, record),
    writeTextFile(paths.sourceMarkdownPath, renderSourceMarkdown(record)),
    writeTextFile(paths.summaryMarkdownPath, output)
  ]);

  const result = {
    reply,
    output,
    savedPaths,
    recordId: record.id
  };

  await persistCanonicalResult({ record, result });

  return result;
}
