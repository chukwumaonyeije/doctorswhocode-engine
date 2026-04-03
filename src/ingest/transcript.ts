import type { IngestedSource } from "../types";
import { AppError } from "../utils/errors";

export async function ingestTranscript(
  input: string,
  sourceType: "transcript" | "audio_transcript" = "transcript"
): Promise<IngestedSource> {
  const normalizedText = input.trim();
  if (!normalizedText) {
    throw new AppError("No transcript text was detected. Paste the transcript directly or send the source URL instead.");
  }

  const lineCount = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
  const speakerCount = countDistinctSpeakers(normalizedText);
  const transcriptOrigin = sourceType === "audio_transcript" ? "inline_audio_transcript" : "inline_text_transcript";

  return {
    sourceType,
    sourceReference: `inline:${sourceType}`,
    rawInput: input,
    normalizedText,
    title: sourceType === "audio_transcript" ? "Inline Audio Transcript" : "Inline Transcript",
    completeness: "transcript_only",
    tags: ["transcript", sourceType === "audio_transcript" ? "audio_transcript" : "inline_transcript"],
    metadata: {
      platform: sourceType === "audio_transcript" ? "audio_transcript" : "inline_transcript",
      transcriptAvailable: true,
      transcriptStatus: "transcript_provided_inline",
      transcriptSource: transcriptOrigin,
      transcriptLineCount: lineCount,
      transcriptCharacterCount: normalizedText.length,
      transcriptSpeakerCount: speakerCount,
      transcriptProvenanceSummary:
        sourceType === "audio_transcript"
          ? `Transcript text was provided inline from an audio-transcript path (${lineCount} lines).`
          : `Transcript text was pasted directly into the workflow (${lineCount} lines).`
    }
  };
}

function countDistinctSpeakers(input: string): number {
  const speakerPattern = /^(?:\[[^\]]+\]\s*)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2}|Speaker\s*\d+|Dr\.?\s+[A-Z][A-Za-z]+|Patient|Host|Moderator|Interviewer)\s*:/gm;
  const speakers = new Set<string>();
  let match: RegExpExecArray | null;

  match = speakerPattern.exec(input);
  while (match) {
    speakers.add(match[1].toLowerCase());
    match = speakerPattern.exec(input);
  }

  return speakers.size;
}
