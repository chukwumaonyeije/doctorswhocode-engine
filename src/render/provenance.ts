import type { NormalizedRecord } from "../types";

type TranscriptAttempt = {
  strategy?: unknown;
  status?: unknown;
  error?: unknown;
};

export function buildCompactProvenanceBlock(record: NormalizedRecord): string | null {
  const transcriptStatus = normalizeText(record.metadata?.transcriptStatus) ?? "unknown";
  const transcriptSource = normalizeText(record.metadata?.transcriptSource);
  const lineCount = typeof record.metadata?.transcriptLineCount === "number" ? record.metadata.transcriptLineCount : null;
  const speakerCount =
    typeof record.metadata?.transcriptSpeakerCount === "number" ? record.metadata.transcriptSpeakerCount : null;
  const summary = normalizeText(record.metadata?.transcriptProvenanceSummary);
  const attempts = formatAttemptSummary(record.metadata?.transcriptAttempts);
  const isTranscriptLike =
    record.sourceType === "transcript" ||
    record.sourceType === "audio_transcript" ||
    record.metadata?.platform === "youtube";
  if (!isTranscriptLike) {
    return null;
  }

  const lines = [
    "Source provenance:",
    `- Basis: ${describeTranscriptBasis(transcriptStatus, transcriptSource)}`,
    `- Completeness: ${record.completeness}`,
    ...(lineCount !== null && lineCount > 0 ? [`- Transcript lines: ${lineCount}`] : []),
    ...(speakerCount !== null && speakerCount > 0 ? [`- Named speakers detected: ${speakerCount}`] : []),
    ...(attempts ? [`- Providers tried: ${attempts}`] : []),
    ...(summary ? [`- Note: ${summary}`] : []),
    ...(transcriptStatus === "metadata_only"
      ? ["- Best next step: paste the transcript directly or retry with deep YouTube analysis if hosted fallbacks are enabled."]
      : [])
  ];

  return lines.join("\n");
}

export function buildSourceProvenanceLines(record: NormalizedRecord): string[] {
  const compact = buildCompactProvenanceBlock(record);
  if (!compact) {
    return [];
  }

  return ["## Provenance", "", ...compact.split("\n")];
}

function describeTranscriptBasis(status: string, source?: string): string {
  if (status === "transcript_provided_inline") {
    if (source === "inline_audio_transcript") {
      return "Transcript text provided inline from an audio-transcript path";
    }

    return "Transcript text pasted directly into the workflow";
  }

  if (status === "metadata_only") {
    return "YouTube metadata only";
  }

  if (status === "transcript_available_local") {
    return `Transcript text from ${source ?? "local provider"}`;
  }

  if (status === "transcript_available_hosted") {
    return `Transcript text from hosted fallback provider ${source ?? ""}`.trim();
  }

  return source ? `Transcript text from ${source}` : "Transcript text available";
}

function formatAttemptSummary(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const formatted = value
    .map((item) => item as TranscriptAttempt)
    .filter((item) => typeof item.strategy === "string" && typeof item.status === "string")
    .map((item) => {
      const strategy = String(item.strategy);
      const status = String(item.status);
      if (status === "failed" && typeof item.error === "string" && item.error.length > 0) {
        return `${strategy} (${shortenError(item.error)})`;
      }

      if (status === "skipped") {
        return `${strategy} (skipped)`;
      }

      return `${strategy} (${status})`;
    });

  return formatted.length > 0 ? formatted.join(", ") : null;
}

function shortenError(value: string): string {
  if (/timed out/i.test(value)) {
    return "timed out";
  }
  if (/not configured/i.test(value)) {
    return "not configured";
  }
  if (/http 429/i.test(value)) {
    return "rate limited";
  }
  if (/http 403/i.test(value)) {
    return "access denied";
  }
  if (/no transcript/i.test(value) || /unavailable/i.test(value)) {
    return "unavailable";
  }

  return "failed";
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
