import axios from "axios";
import { config } from "../config";
import { logError, logInfo } from "../utils/logging";
import type { NormalizedRecord } from "../types";

export interface GithubDraftSyncResult {
  status: "not_requested" | "pending" | "synced" | "failed";
  target?: string;
  errorMessage?: string;
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
    return { status: "failed", target: path, errorMessage: "GITHUB_TOKEN is not configured." };
  }

  const repoPath = toRepoRelativePath(path);
  const apiUrl = `https://api.github.com/repos/${config.githubRepo}/contents/${repoPath}`;
  const message = `Add draft publish output for ${record.slug}`;

  try {
    logInfo("github_sync_started", {
      repo: config.githubRepo,
      branch: config.githubBranch,
      repoPath
    });

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
      target: `${config.githubRepo}:${config.githubBranch}:${repoPath}`
    };
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const responseData = axios.isAxiosError(error) ? error.response?.data : undefined;
    const errorMessage = buildGithubErrorMessage(status, responseData, error);

    logError("github_sync_failed", {
      repo: config.githubRepo,
      branch: config.githubBranch,
      repoPath,
      status,
      response: responseData,
      errorMessage
    });

    return {
      status: "failed",
      target: `${config.githubRepo}:${config.githubBranch}:${repoPath}`,
      errorMessage
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
  const normalized = filePath.replace(/\\/g, "/");
  const cwdNormalized = process.cwd().replace(/\\/g, "/");

  if (normalized.startsWith(`${cwdNormalized}/`)) {
    return normalized.slice(cwdNormalized.length + 1);
  }

  if (normalized.startsWith("/app/")) {
    return normalized.slice("/app/".length);
  }

  return normalized.replace(/^\/+/, "");
}

function buildGithubErrorMessage(status: number | undefined, responseData: unknown, error: unknown): string {
  if (axios.isAxiosError(error)) {
    const githubMessage =
      typeof responseData === "object" && responseData !== null && "message" in responseData
        ? String((responseData as { message?: unknown }).message ?? "")
        : "";

    if (status) {
      return githubMessage ? `GitHub API ${status}: ${githubMessage}` : `GitHub API ${status}`;
    }

    return error.message;
  }

  return error instanceof Error ? error.message : "Unknown GitHub sync failure";
}
