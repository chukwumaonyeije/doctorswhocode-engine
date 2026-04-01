import axios from "axios";
import type { IngestedSource, SourceType } from "../types";

export async function ingestUrl(url: string): Promise<IngestedSource> {
  const cleanUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
  const response = await axios.get<string>(cleanUrl, {
    headers: { Accept: "text/plain" },
    timeout: 30000
  });

  const normalizedText = response.data.trim();
  const title = extractTitle(normalizedText);
  const sourceType: SourceType = inferUrlSourceType(url);

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
