import { renderSourceMarkdown } from "../render/markdown";
import { renderMdxDocument } from "../render/mdx";
import { buildRecordPaths, writeJsonFile, writeTextFile } from "../storage/fs";
import { syncDraftPublishOutput } from "../storage/github";
import { persistCanonicalResult } from "../storage/recordStore";
import type { ActionArtifacts, ActionContext } from "../types";
import { generateActionOutput } from "./shared";

export async function runMdxAction({ record }: ActionContext): Promise<ActionArtifacts> {
  const draftBody = await generateActionOutput("mdx", record);
  const mdx = renderMdxDocument(record, draftBody);
  const paths = buildRecordPaths(record);

  const savedPaths = await Promise.all([
    writeJsonFile(paths.recordJsonPath, record),
    writeTextFile(paths.sourceMarkdownPath, renderSourceMarkdown(record)),
    writeTextFile(paths.mdxPath, mdx)
  ]);

  const githubSync = await syncDraftPublishOutput({
    record,
    body: mdx,
    path: paths.mdxPath,
    shouldSync: true
  });

  const result = {
    reply: [
      "MDX draft created.",
      "",
      draftBody,
      "",
      `Saved MDX: ${paths.mdxPath}`,
      `Canonical record ID: ${record.id}`,
      `GitHub draft sync: ${githubSync.status}${githubSync.target ? ` (${githubSync.target})` : ""}${
        githubSync.errorMessage ? ` | ${githubSync.errorMessage}` : ""
      }`
    ].join("\n"),
    output: mdx,
    savedPaths,
    recordId: record.id
  };

  await persistCanonicalResult({
    record,
    result,
    githubSyncStatus: githubSync.status,
    githubSyncTarget: githubSync.target
  });

  return result;
}
