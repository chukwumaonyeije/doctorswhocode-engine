import type { IngestedSource } from "../types";
import { classifyInput } from "../normalize/normalizeInput";
import { ingestAudioTranscript } from "./audio";
import { ingestPdfFilePath, ingestPdfUrl } from "./pdf";
import { ingestPubMed } from "./pubmed";
import { ingestText } from "./text";
import { ingestTranscript } from "./transcript";
import { ingestYouTube } from "./youtube";
import { ingestUrl } from "./url";
import { logSourceCounter } from "../utils/logging";

export async function ingestInput(input: string): Promise<IngestedSource> {
  return ingestInputWithOptions(input);
}

export async function ingestInputWithOptions(
  input: string,
  options?: {
    analysisMode?: "default" | "youtube_fast" | "youtube_deep";
    requestId?: string;
  }
): Promise<IngestedSource> {
  const classification = classifyInput(input);
  try {
    let ingested: IngestedSource;

    switch (classification) {
      case "pubmed":
        ingested = await ingestPubMed(input);
        break;
      case "pdf_document":
        ingested = isHttpUrl(input) ? await ingestPdfUrl(input) : await ingestPdfFilePath(input);
        break;
      case "webpage":
      case "research_article":
        ingested = await ingestUrl(input, { requestId: options?.requestId });
        break;
      case "transcript":
        if (/(youtube\.com|youtu\.be)/i.test(input)) {
          ingested = await ingestYouTube(input, {
            allowHostedProviders: options?.analysisMode === "youtube_deep",
            requestId: options?.requestId
          });
          break;
        }
        ingested = await ingestTranscript(input);
        break;
      case "audio_transcript":
        ingested = await ingestAudioTranscript(input);
        break;
      case "text":
      case "unknown":
      default:
        ingested = await ingestText(input);
        break;
    }

    logSourceCounter({
      source: ingested.sourceType,
      outcome: "success",
      requestId: options?.requestId,
      classifiedSource: classification,
      resolvedSourceType: ingested.sourceType,
      completeness: ingested.completeness
    });

    return ingested;
  } catch (error) {
    logSourceCounter({
      source: classification,
      outcome: "failure",
      requestId: options?.requestId,
      classifiedSource: classification,
      detail: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}
