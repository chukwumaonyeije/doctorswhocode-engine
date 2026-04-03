import axios from "axios";
import { config } from "../config";
import { AppError } from "../utils/errors";
import { logInfo, logSourceCounter, logStage } from "../utils/logging";
import type { IngestedSource } from "../types";

type YoutubeTranscriptLine = {
  text: string;
  duration?: number;
  offset?: number;
};

type YoutubeTranscriptApi = {
  fetchTranscript: (videoIdOrUrl: string) => Promise<YoutubeTranscriptLine[]>;
};

type TranscriptAttempt = {
  strategy: string;
  status: "success" | "failed" | "skipped";
  error?: string;
};

interface YouTubeOEmbedResponse {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
}

export async function ingestYouTube(
  url: string,
  options?: {
    allowHostedProviders?: boolean;
    requestId?: string;
  }
): Promise<IngestedSource> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new AppError("Could not determine the YouTube video ID from that URL.");
  }

  const metadata = await fetchYouTubeMetadata(url);
  logInfo("youtube_metadata_resolved", {
    requestId: options?.requestId,
    videoId,
    title: metadata.title,
    authorName: metadata.author_name,
    hasThumbnail: Boolean(metadata.thumbnail_url)
  });
  const transcriptResult = await fetchYouTubeTranscript(url, {
    allowHostedProviders: options?.allowHostedProviders ?? false,
    requestId: options?.requestId,
    videoId
  });
  const transcriptLines = transcriptResult.lines ?? [];
  const transcriptStatus = buildTranscriptStatus({
    hasTranscript: transcriptLines.length > 0,
    source: transcriptResult.source
  });

  logSourceCounter({
    source: "youtube_transcript_resolution",
    outcome: transcriptLines.length > 0 ? "success" : "failure",
    requestId: options?.requestId,
    classifiedSource: "transcript",
    resolvedSourceType: transcriptLines.length > 0 ? "transcript" : "webpage",
    completeness: transcriptLines.length > 0 ? "transcript_only" : "partial",
    detail: transcriptLines.length > 0 ? transcriptStatus : summarizeTranscriptError(transcriptResult.error) ?? "metadata_only"
  });

  logStage({
    requestId: options?.requestId,
    stage: "youtube_transcript_resolution",
    status: transcriptLines.length > 0 ? "completed" : "failed",
    source: "youtube",
    detail: transcriptLines.length > 0 ? transcriptStatus : summarizeTranscriptError(transcriptResult.error) ?? "metadata_only",
    meta: {
      videoId,
      transcriptStatus,
      transcriptSource: transcriptResult.source,
      transcriptAttemptCount: transcriptResult.attempts.length,
      transcriptAttempts: transcriptResult.attempts
    }
  });

  const normalizedText =
    transcriptLines.length > 0
      ? [
          `YouTube transcript for ${metadata.title ?? `video ${videoId}`}`,
          "",
          ...transcriptLines.map((line) => line.text.trim()).filter(Boolean)
        ].join("\n")
      : buildMetadataOnlyText({
          videoId,
          title: metadata.title,
          authorName: metadata.author_name,
          url,
          transcriptError: transcriptResult.error
        });

  return {
    sourceType: transcriptLines.length > 0 ? "transcript" : "webpage",
    sourceReference: url,
    rawInput: url,
    normalizedText,
    title: metadata.title ?? `YouTube video ${videoId}`,
    authors: metadata.author_name ? [metadata.author_name] : [],
    publication: "YouTube",
      completeness: transcriptLines.length > 0 ? "transcript_only" : "partial",
    tags: ["youtube", transcriptLines.length > 0 ? "transcript" : "metadata_only"],
    metadata: {
      platform: "youtube",
      videoId,
      authorUrl: metadata.author_url,
      thumbnailUrl: metadata.thumbnail_url,
      transcriptAvailable: transcriptLines.length > 0,
      transcriptStatus,
      transcriptSource: transcriptResult.source,
      transcriptFetchError: transcriptResult.error
      ,
      transcriptLineCount: transcriptLines.length,
      transcriptCharacterCount: transcriptLines.reduce((total, line) => total + line.text.trim().length, 0),
      transcriptAttempts: transcriptResult.attempts,
      transcriptProvenanceSummary: buildTranscriptProvenanceSummary({
        status: transcriptStatus,
        source: transcriptResult.source,
        attempts: transcriptResult.attempts,
        lineCount: transcriptLines.length
      })
    }
  };
}

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "") || null;
    }

    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }

      const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/?]+)/);
      if (shortsMatch) {
        return shortsMatch[1];
      }

      const embedMatch = parsed.pathname.match(/^\/embed\/([^/?]+)/);
      if (embedMatch) {
        return embedMatch[1];
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function fetchYouTubeMetadata(url: string): Promise<YouTubeOEmbedResponse> {
  try {
    const response = await axios.get<YouTubeOEmbedResponse>("https://www.youtube.com/oembed", {
      params: {
        url,
        format: "json"
      },
      timeout: 15000
    });

    return response.data;
  } catch {
    return {};
  }
}

async function fetchYouTubeTranscript(
  url: string,
  options?: {
    allowHostedProviders?: boolean;
    requestId?: string;
    videoId?: string;
  }
): Promise<{ lines?: YoutubeTranscriptLine[]; error?: string; source?: string; attempts: TranscriptAttempt[] }> {
  const attempts: TranscriptAttempt[] = [];

  logStage({
    requestId: options?.requestId,
    stage: "youtube_transcript_resolution",
    status: "started",
    source: "youtube",
    detail: options?.allowHostedProviders ? "Hosted fallbacks enabled" : "Hosted fallbacks disabled",
    meta: {
      videoId: options?.videoId
    }
  });

  const primary = await fetchTranscriptWithPrimaryStrategy(url, options);
  if (primary.lines?.length) {
    return {
      ...primary,
      attempts: [...attempts, { strategy: "youtube-transcript", status: "success" }]
    };
  }
  if (primary.error) {
    attempts.push({ strategy: "youtube-transcript", status: "failed", error: primary.error });
  }

  const videoId = extractYouTubeVideoId(url);
  if (videoId) {
    const fallback = await fetchTranscriptWithFallbackStrategy(videoId, options);
    if (fallback.lines?.length) {
      return {
        ...fallback,
        attempts: [...attempts, { strategy: "youtube-transcript-api", status: "success" }]
      };
    }
    if (fallback.error) {
      attempts.push({ strategy: "youtube-transcript-api", status: "failed", error: fallback.error });
    }
  }

  if (options?.allowHostedProviders) {
    const supadata = await fetchTranscriptWithSupadata(url, options);
    if (supadata.lines?.length) {
      return {
        ...supadata,
        attempts: [...attempts, { strategy: "supadata", status: "success" }]
      };
    }
    if (supadata.error) {
      attempts.push({ strategy: "supadata", status: "failed", error: supadata.error });
    }

    if (videoId) {
      const fetchTranscript = await fetchTranscriptWithFetchTranscript(videoId, options);
      if (fetchTranscript.lines?.length) {
        return {
          ...fetchTranscript,
          attempts: [...attempts, { strategy: "fetchtranscript", status: "success" }]
        };
      }
      if (fetchTranscript.error) {
        attempts.push({ strategy: "fetchtranscript", status: "failed", error: fetchTranscript.error });
      }
    }
  } else {
    attempts.push({ strategy: "supadata", status: "skipped", error: "Hosted fallback disabled" });
    attempts.push({ strategy: "fetchtranscript", status: "skipped", error: "Hosted fallback disabled" });
  }

  return {
    error:
      attempts
        .filter((attempt) => attempt.status === "failed")
        .map((attempt) => `${attempt.strategy}:${attempt.error}`)
        .join(" | ") || "Transcript unavailable",
    attempts
  };
}

async function loadYoutubeTranscript(): Promise<YoutubeTranscriptApi> {
  const module = (await import("youtube-transcript")) as {
    YoutubeTranscript?: YoutubeTranscriptApi;
    default?: YoutubeTranscriptApi;
  };

  if (module.YoutubeTranscript) {
    return module.YoutubeTranscript;
  }

  if (module.default) {
    return module.default;
  }

  throw new AppError("YouTube transcript module could not be loaded.");
}

async function fetchTranscriptWithPrimaryStrategy(
  url: string,
  options?: {
    requestId?: string;
    videoId?: string;
  }
): Promise<{ lines?: YoutubeTranscriptLine[]; error?: string; source?: string }> {
  try {
    logInfo("youtube_transcript_attempt", {
      requestId: options?.requestId,
      videoId: options?.videoId,
      strategy: "youtube-transcript"
    });

    const YoutubeTranscript = await loadYoutubeTranscript();
    const lines = await Promise.race([
      YoutubeTranscript.fetchTranscript(url),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("YouTube transcript request timed out.")), 20000);
      })
    ]);

    logInfo("youtube_transcript_success", {
      requestId: options?.requestId,
      videoId: options?.videoId,
      strategy: "youtube-transcript",
      lineCount: lines.length
    });

    return {
      lines,
      source: "youtube-transcript"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Primary transcript strategy failed";
    logInfo("youtube_transcript_failure", {
      requestId: options?.requestId,
      videoId: options?.videoId,
      strategy: "youtube-transcript",
      error: message
    });
    return {
      error: message
    };
  }
}

async function fetchTranscriptWithFallbackStrategy(
  videoId: string,
  options?: {
    requestId?: string;
  }
): Promise<{ lines?: YoutubeTranscriptLine[]; error?: string; source?: string }> {
  try {
    logInfo("youtube_transcript_attempt", {
      requestId: options?.requestId,
      videoId,
      strategy: "youtube-transcript-api"
    });

    const transcriptApi = await loadYoutubeTranscriptApi();
    const transcript = await Promise.race([
      transcriptApi.getTranscript(videoId),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Fallback transcript request timed out.")), 20000);
      })
    ]);

    const lines = transcript.map((item) => ({
      text: item.text,
      offset: Number(item.offset ?? 0),
      duration: Number(item.duration ?? 0)
    }));

    logInfo("youtube_transcript_success", {
      requestId: options?.requestId,
      videoId,
      strategy: "youtube-transcript-api",
      lineCount: lines.length
    });

    return {
      lines,
      source: "youtube-transcript-api"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fallback transcript strategy failed";
    logInfo("youtube_transcript_failure", {
      requestId: options?.requestId,
      videoId,
      strategy: "youtube-transcript-api",
      error: message
    });
    return {
      error: message
    };
  }
}

async function fetchTranscriptWithSupadata(
  url: string,
  options?: {
    requestId?: string;
    videoId?: string;
  }
): Promise<{ lines?: YoutubeTranscriptLine[]; error?: string; source?: string }> {
  if (!config.supadataApiKey) {
    return { error: "Supadata API key not configured" };
  }

  try {
    logInfo("youtube_transcript_attempt", {
      requestId: options?.requestId,
      videoId: options?.videoId,
      strategy: "supadata"
    });

    const initialResponse = await axios.get("https://api.supadata.ai/v1/transcript", {
      params: {
        url,
        text: false,
        mode: "native"
      },
      headers: {
        "x-api-key": config.supadataApiKey
      },
      timeout: 30000,
      validateStatus: () => true
    });

    if (initialResponse.status === 200) {
      const lines = mapSupadataContentToLines(initialResponse.data?.content);
      if (lines.length > 0) {
        logInfo("youtube_transcript_success", {
          requestId: options?.requestId,
          videoId: options?.videoId,
          strategy: "supadata",
          lineCount: lines.length
        });
        return {
          lines,
          source: "supadata"
        };
      }
    }

    if (initialResponse.status === 202 && initialResponse.data?.jobId) {
      const jobResult = await pollSupadataJob(initialResponse.data.jobId);
      if (jobResult.lines?.length) {
        return jobResult;
      }
      return { error: jobResult.error ?? "Supadata job did not return transcript" };
    }

    return {
      error: `Supadata returned HTTP ${initialResponse.status}`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supadata transcript strategy failed";
    logInfo("youtube_transcript_failure", {
      requestId: options?.requestId,
      videoId: options?.videoId,
      strategy: "supadata",
      error: message
    });
    return {
      error: message
    };
  }
}

async function pollSupadataJob(
  jobId: string
): Promise<{ lines?: YoutubeTranscriptLine[]; error?: string; source?: string }> {
  const deadline = Date.now() + 60000;

  while (Date.now() < deadline) {
    const response = await axios.get(`https://api.supadata.ai/v1/transcript/${jobId}`, {
      headers: {
        "x-api-key": config.supadataApiKey
      },
      timeout: 15000,
      validateStatus: () => true
    });

    if (response.status >= 400) {
      return {
        error: `Supadata job polling returned HTTP ${response.status}`
      };
    }

    const status = response.data?.status;
    if (status === "completed") {
      const lines = mapSupadataContentToLines(response.data?.content);
      if (lines.length > 0) {
        logInfo("youtube_transcript_success", {
          strategy: "supadata",
          lineCount: lines.length
        });
        return {
          lines,
          source: "supadata"
        };
      }

      return {
        error: "Supadata completed but returned no transcript content"
      };
    }

    if (status === "failed") {
      return {
        error: response.data?.error ?? "Supadata transcript job failed"
      };
    }

    await delay(1000);
  }

  return {
    error: "Supadata transcript polling timed out"
  };
}

async function fetchTranscriptWithFetchTranscript(
  videoId: string,
  options?: {
    requestId?: string;
  }
): Promise<{ lines?: YoutubeTranscriptLine[]; error?: string; source?: string }> {
  if (!config.fetchTranscriptApiKey) {
    return { error: "FetchTranscript API key not configured" };
  }

  try {
    logInfo("youtube_transcript_attempt", {
      requestId: options?.requestId,
      videoId,
      strategy: "fetchtranscript"
    });

    const response = await axios.get(`https://api.fetchtranscript.com/v1/transcripts/${videoId}`, {
      params: {
        format: "json",
        lang: "en"
      },
      headers: {
        Authorization: `Bearer ${config.fetchTranscriptApiKey}`
      },
      timeout: 30000,
      validateStatus: () => true
    });

    if (response.status !== 200) {
      return {
        error: `FetchTranscript returned HTTP ${response.status}`
      };
    }

    const segments: Array<{ text?: unknown; start?: unknown; duration?: unknown }> = Array.isArray(
      response.data?.segments
    )
      ? response.data.segments
      : [];
    const lines = segments
      .map((segment) => ({
        text: String(segment.text ?? ""),
        offset: Number(segment.start ?? 0) * 1000,
        duration: Number(segment.duration ?? 0) * 1000
      }))
      .filter((segment) => segment.text.trim().length > 0);

    if (lines.length === 0) {
      return {
        error: "FetchTranscript returned no transcript segments"
      };
    }

    logInfo("youtube_transcript_success", {
      requestId: options?.requestId,
      videoId,
      strategy: "fetchtranscript",
      lineCount: lines.length
    });

    return {
      lines,
      source: "fetchtranscript"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "FetchTranscript strategy failed";
    logInfo("youtube_transcript_failure", {
      requestId: options?.requestId,
      videoId,
      strategy: "fetchtranscript",
      error: message
    });
    return {
      error: message
    };
  }
}

async function loadYoutubeTranscriptApi(): Promise<{
  getTranscript: (videoId: string) => Promise<Array<{ text: string; offset?: number; duration?: number }>>;
}> {
  const module = require("youtube-transcript-api") as {
    getTranscript?: (videoId: string) => Promise<Array<{ text: string; offset?: number; duration?: number }>>;
    default?: {
      getTranscript?: (videoId: string) => Promise<Array<{ text: string; offset?: number; duration?: number }>>;
    };
  };

  if (module.getTranscript) {
    return {
      getTranscript: module.getTranscript
    };
  }

  if (module.default?.getTranscript) {
    return {
      getTranscript: module.default.getTranscript
    };
  }

  throw new AppError("Fallback YouTube transcript API module could not be loaded.");
}

function buildMetadataOnlyText(params: {
  videoId: string;
  title?: string;
  authorName?: string;
  url: string;
  transcriptError?: string;
}): string {
  const guidance =
    "Transcript text was not available from the current retrieval path, so this run falls back to metadata only. You can still get a directional read now, but the strongest next step is to paste the transcript directly.";
  const transcriptDetail = summarizeTranscriptError(params.transcriptError);

  return [
    "YouTube analysis ran in metadata-only mode.",
    `Title: ${params.title ?? "Unknown"}`,
    `Channel: ${params.authorName ?? "Unknown"}`,
    `Source: ${params.url}`,
    `Video ID: ${params.videoId}`,
    ...(transcriptDetail ? [`Transcript status: ${transcriptDetail}`] : []),
    guidance,
    "Best fallback: paste the transcript text directly, or retry with a deep YouTube request if hosted transcript fallbacks are enabled."
  ].join("\n");
}

function mapSupadataContentToLines(content: unknown): YoutubeTranscriptLine[] {
  if (typeof content === "string") {
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({ text: line }));
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => ({
        text: String((item as { text?: unknown }).text ?? ""),
        offset: Number((item as { offset?: unknown }).offset ?? 0),
        duration: Number((item as { duration?: unknown }).duration ?? 0)
      }))
      .filter((line) => line.text.trim().length > 0);
  }

  return [];
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function summarizeTranscriptError(error?: string): string | null {
  if (!error) {
    return null;
  }

  if (/caption/i.test(error) || /subtitles/i.test(error)) {
    return "No accessible transcript track was exposed by the video.";
  }

  if (/private/i.test(error) || /unavailable/i.test(error) && /video/i.test(error)) {
    return "The video was not accessible to the transcript providers.";
  }

  if (/timed out/i.test(error)) {
    return "Transcript retrieval timed out.";
  }

  if (/not configured/i.test(error)) {
    return "Hosted transcript fallback is not configured.";
  }

  if (/http 429/i.test(error)) {
    return "Transcript provider rate-limited the request.";
  }

  if (/http 403/i.test(error)) {
    return "Transcript provider denied access to the video.";
  }

  if (/Transcript unavailable/i.test(error)) {
    return "No transcript was available from the current providers.";
  }

  if (/could not be loaded/i.test(error)) {
    return "Transcript retrieval module could not be loaded.";
  }

  return "Transcript could not be retrieved from the current providers.";
}

function buildTranscriptStatus(params: {
  hasTranscript: boolean;
  source?: string;
}): string {
  if (!params.hasTranscript) {
    return "metadata_only";
  }

  if (params.source === "youtube-transcript" || params.source === "youtube-transcript-api") {
    return "transcript_available_local";
  }

  if (params.source === "supadata" || params.source === "fetchtranscript") {
    return "transcript_available_hosted";
  }

  return "transcript_available";
}

function buildTranscriptProvenanceSummary(params: {
  status: string;
  source?: string;
  attempts: TranscriptAttempt[];
  lineCount: number;
}): string {
  if (params.status === "metadata_only") {
    const failedStrategies = params.attempts
      .filter((attempt) => attempt.status === "failed")
      .map((attempt) => attempt.strategy);
    return failedStrategies.length > 0
      ? `Metadata only. Transcript unavailable after attempts: ${failedStrategies.join(", ")}.`
      : "Metadata only. Transcript was not available from the configured providers.";
  }

  const sourceLabel = params.source ?? "unknown provider";
  return `Transcript text available from ${sourceLabel} (${params.lineCount} lines).`;
}
