import axios from "axios";
import { config } from "../config";
import type { NormalizedRecord } from "../types";

export interface GithubDraftSyncResult {
  status: "not_requested" | "pending" | "synced" | "failed";
  target?: string;
}

export async function syncDraftPublishOutput(params: {
  record: NormalizedRecord;
  body: string;
  path: string;
  shouldSync: boolean;
}): Promise<GithubDraftSyncResult> {
  const { record, body, path, shouldSync } = params;

  if (!shouldSync) {
    return { status: "not_requested" };
  }

  if (!config.githubToken) {
    return { status: "failed", target: path };
  }

  const apiUrl = `https://api.github.com/repos/${config.githubRepo}/contents/${toRepoRelativePath(path)}`;
  const message = `Add draft publish output for ${record.slug}`;

  try {
    const existing = await axios
      .get(apiUrl, {
        headers: buildHeaders()
      })
      .then((response) => response.data)
      .catch(() => null);

    await axios.put(
      apiUrl,
      {
        message,
        content: Buffer.from(body, "utf8").toString("base64"),
        branch: config.githubBranch,
        sha: existing?.sha
      },
      {
        headers: buildHeaders()
      }
    );

    return {
      status: "synced",
      target: `${config.githubRepo}:${config.githubBranch}:${toRepoRelativePath(path)}`
    };
  } catch {
    return {
      status: "failed",
      target: `${config.githubRepo}:${config.githubBranch}:${toRepoRelativePath(path)}`
    };
  }
}

function buildHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${config.githubToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function toRepoRelativePath(filePath: string): string {
  return filePath.replace(`${process.cwd()}\\`, "").replace(/\\/g, "/");
}
