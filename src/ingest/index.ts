import type { IngestedSource } from "../types";
import { classifyInput } from "../normalize/normalizeInput";
import { ingestAudioTranscript } from "./audio";
import { ingestPdfFilePath, ingestPdfUrl } from "./pdf";
import { ingestPubMed } from "./pubmed";
import { ingestText } from "./text";
import { ingestTranscript } from "./transcript";
import { ingestYouTube } from "./youtube";
import { ingestUrl } from "./url";
import { logSourceCounter, logStage } from "../utils/logging";

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
  logStage({
    requestId: options?.requestId,
    stage: "ingest_classification",
    status: "completed",
    source: classification,
    detail: `Input classified as ${classification}`
  });

  try {
    let ingested: IngestedSource;

    logStage({
      requestId: options?.requestId,
      stage: "ingest_source_resolution",
      status: "started",
      source: classification
    });

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
            allowHostedProviders:
              options?.analysisMode === "youtube_deep" || options?.analysisMode === "youtube_fast",
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

    logStage({
      requestId: options?.requestId,
      stage: "ingest_source_resolution",
      status: "completed",
      source: classification,
      detail: `Resolved as ${ingested.sourceType}`,
      meta: {
        resolvedSourceType: ingested.sourceType,
        completeness: ingested.completeness,
        title: ingested.title
      }
    });

    return ingested;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logSourceCounter({
      source: classification,
      outcome: "failure",
      requestId: options?.requestId,
      classifiedSource: classification,
      detail
    });
    logStage({
      requestId: options?.requestId,
      stage: "ingest_source_resolution",
      status: "failed",
      source: classification,
      detail
    });
    throw error;
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}
