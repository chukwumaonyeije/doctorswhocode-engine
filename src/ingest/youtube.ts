import axios from "axios";
import { AppError } from "../utils/errors";
import type { IngestedSource } from "../types";

type YoutubeTranscriptLine = {
  text: string;
  duration?: number;
  offset?: number;
};

type YoutubeTranscriptApi = {
  fetchTranscript: (videoIdOrUrl: string) => Promise<YoutubeTranscriptLine[]>;
};

const { YoutubeTranscript } = require("youtube-transcript") as {
  YoutubeTranscript: YoutubeTranscriptApi;
};

interface YouTubeOEmbedResponse {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
}

export async function ingestYouTube(url: string): Promise<IngestedSource> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new AppError("Could not determine the YouTube video ID from that URL.");
  }

  const metadata = await fetchYouTubeMetadata(url);
  const transcriptResult = await fetchYouTubeTranscript(url);
  const transcriptLines = transcriptResult.lines ?? [];

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
          url
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
      transcriptFetchError: transcriptResult.error
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
  url: string
): Promise<{ lines?: YoutubeTranscriptLine[]; error?: string }> {
  try {
    const lines = await Promise.race([
      YoutubeTranscript.fetchTranscript(url),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("YouTube transcript request timed out.")), 20000);
      })
    ]);

    return { lines };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Transcript unavailable"
    };
  }
}

function buildMetadataOnlyText(params: {
  videoId: string;
  title?: string;
  authorName?: string;
  url: string;
}): string {
  return [
    "YouTube video metadata only.",
    `Title: ${params.title ?? "Unknown"}`,
    `Channel: ${params.authorName ?? "Unknown"}`,
    `URL: ${params.url}`,
    `Video ID: ${params.videoId}`,
    "Transcript was not available from the current retrieval path."
  ].join("\n");
}
