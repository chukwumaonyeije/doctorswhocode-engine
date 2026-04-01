import type { IngestedSource } from "../types";
import { classifyInput } from "../normalize/normalizeInput";
import { ingestAudioTranscript } from "./audio";
import { ingestPubMed } from "./pubmed";
import { ingestText } from "./text";
import { ingestTranscript } from "./transcript";
import { ingestYouTube } from "./youtube";
import { ingestUrl } from "./url";

export async function ingestInput(input: string): Promise<IngestedSource> {
  const classification = classifyInput(input);

  switch (classification) {
    case "pubmed":
      return ingestPubMed(input);
    case "webpage":
    case "research_article":
      return ingestUrl(input);
    case "transcript":
      if (/(youtube\.com|youtu\.be)/i.test(input)) {
        return ingestYouTube(input);
      }
      return ingestTranscript(input);
    case "audio_transcript":
      return ingestAudioTranscript(input);
    case "text":
    case "unknown":
    default:
      return ingestText(input);
  }
}
