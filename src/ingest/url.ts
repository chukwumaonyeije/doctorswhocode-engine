import axios from "axios";
import { AppError } from "../utils/errors";
import type { IngestedSource, SourceType } from "../types";
import { logInfo } from "../utils/logging";

export async function ingestUrl(url: string, options?: { requestId?: string }): Promise<IngestedSource> {
  const cleanUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
  let response;
  let lastError: unknown;

  for (let attempt = 1; attempt <= URL_EXTRACTION_MAX_ATTEMPTS; attempt += 1) {
    try {
      response = await axios.get<string>(cleanUrl, {
        headers: { Accept: "text/plain" },
        timeout: 30000
      });
      break;
    } catch (error) {
      lastError = error;
      if (!shouldRetryUrlExtraction(error, attempt)) {
        throw mapUrlExtractionError(error);
      }

      logInfo("url_extraction_retry", {
        attempt,
        nextAttempt: attempt + 1,
        requestId: options?.requestId,
        url,
        reason: describeUrlExtractionRetryReason(error)
      });
      await sleep(URL_EXTRACTION_RETRY_DELAYS_MS[attempt - 1] ?? 400);
    }
  }

  if (!response) {
    throw mapUrlExtractionError(lastError);
  }

  const normalizedText = response.data.trim();
  const title = extractTitle(normalizedText);
  const sourceType: SourceType = inferUrlSourceType(url);

  if (!normalizedText) {
    throw new AppError("The page was reached, but no extractable text was returned. Try pasting the text directly.");
  }

  return {
    sourceType,
    sourceReference: url,
    rawInput: url,
    normalizedText,
    title,
    completeness: normalizedText.length > 1500 ? "full_text" : "partial",
    tags: buildUrlTags(url, sourceType)
  };
}

function inferUrlSourceType(url: string): SourceType {
  if (/pubmed\.ncbi\.nlm\.nih\.gov/i.test(url)) {
    return "pubmed";
  }

  if (/(nejm|jamanetwork|thelancet|bmj|nature|science|medrxiv|biorxiv)/i.test(url)) {
    return "research_article";
  }

  if (/(youtube\.com|youtu\.be)/i.test(url)) {
    return "transcript";
  }

  return "webpage";
}

function extractTitle(text: string): string | undefined {
  const firstNonEmptyLine = text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return firstNonEmptyLine?.replace(/^#\s*/, "");
}

function buildUrlTags(url: string, sourceType: SourceType): string[] {
  const tags: string[] = [sourceType];
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    tags.push(hostname);
  } catch {
    // Ignore malformed URL parsing here; upstream validation handles command input.
  }

  return tags;
}

const URL_EXTRACTION_MAX_ATTEMPTS = 3;
const URL_EXTRACTION_RETRY_DELAYS_MS = [400, 900];

function shouldRetryUrlExtraction(error: unknown, attempt: number): boolean {
  if (attempt >= URL_EXTRACTION_MAX_ATTEMPTS) {
    return false;
  }

  if (!axios.isAxiosError(error)) {
    return false;
  }

  const statusCode = error.response?.status;
  if (statusCode && [408, 425, 429, 500, 502, 503, 504].includes(statusCode)) {
    return true;
  }

  return ["ECONNABORTED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(error.code ?? "");
}

function describeUrlExtractionRetryReason(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return "unknown_error";
  }

  const statusCode = error.response?.status;
  if (statusCode) {
    return `http_${statusCode}`;
  }

  return error.code ?? "axios_error";
}

function mapUrlExtractionError(error: unknown): AppError {
  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status;

    if (statusCode === 451) {
      return new AppError(
        "This page could not be extracted because the source or proxy blocked access (HTTP 451). Try pasting the text directly or using a different source URL."
      );
    }

    if (statusCode === 403) {
      return new AppError(
        "This page blocked extraction access (HTTP 403). Try pasting the text directly or using another link."
      );
    }

    if (statusCode === 404) {
      return new AppError("That URL could not be found (HTTP 404). Check the link and try again.");
    }

    if (error.code === "ECONNABORTED") {
      return new AppError(
        "The page extraction request timed out. Try again, paste the text directly, or use a shorter source page."
      );
    }

    return new AppError(
      `This page could not be extracted${statusCode ? ` (HTTP ${statusCode})` : ""}. Try pasting the text directly or using a different source URL.`
    );
  }

  return new AppError("An unexpected error occurred while trying to extract the webpage.");
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
