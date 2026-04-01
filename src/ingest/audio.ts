import type { IngestedSource } from "../types";
import { ingestTranscript } from "./transcript";

export async function ingestAudioTranscript(input: string): Promise<IngestedSource> {
  return ingestTranscript(input, "audio_transcript");
}
