import type { IngestedSource } from "../types";

export async function ingestTranscript(
  input: string,
  sourceType: "transcript" | "audio_transcript" = "transcript"
): Promise<IngestedSource> {
  return {
    sourceType,
    sourceReference: `inline:${sourceType}`,
    rawInput: input,
    normalizedText: input.trim(),
    completeness: "transcript_only",
    tags: ["transcript"]
  };
}
