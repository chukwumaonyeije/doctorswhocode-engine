import fs from "fs/promises";
import path from "path";
import { config } from "../config";
import type { NormalizedRecord } from "../types";

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function ensureStorageStructure(): Promise<void> {
  await Promise.all([
    ensureDir(path.join(config.archiveDir, "records")),
    ensureDir(path.join(config.archiveDir, "sources")),
    ensureDir(path.join(config.archiveDir, "summaries")),
    ensureDir(path.join(config.archiveDir, "transcripts")),
    ensureDir(config.contentBlogDir)
  ]);
}

export async function writeTextFile(filePath: string, contents: string): Promise<string> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, contents, "utf8");
  return filePath;
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<string> {
  return writeTextFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export function buildRecordPaths(record: NormalizedRecord): {
  recordJsonPath: string;
  sourceMarkdownPath: string;
  summaryMarkdownPath: string;
  transcriptMarkdownPath: string;
  mdxPath: string;
} {
  const baseName = `${record.createdAt.slice(0, 10)}-${record.slug}-${record.id}`;

  return {
    recordJsonPath: path.join(config.archiveDir, "records", `${baseName}.json`),
    sourceMarkdownPath: path.join(config.archiveDir, "sources", `${baseName}.md`),
    summaryMarkdownPath: path.join(config.archiveDir, "summaries", `${baseName}.md`),
    transcriptMarkdownPath: path.join(config.archiveDir, "transcripts", `${baseName}.md`),
    mdxPath: path.join(config.contentBlogDir, `${baseName}.mdx`)
  };
}
