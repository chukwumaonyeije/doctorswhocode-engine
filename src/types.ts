export type CanonicalAction = "digest" | "file" | "summarize" | "mdx";
export type AppAction = CanonicalAction | "retrieve" | "recent" | "search" | "pdf";

export type SourceType =
  | "text"
  | "webpage"
  | "pubmed"
  | "research_article"
  | "transcript"
  | "audio_transcript"
  | "unknown";

export type Completeness =
  | "full_text"
  | "abstract_only"
  | "transcript_only"
  | "partial"
  | "unknown";

export interface ParsedCommand {
  valid: boolean;
  action?: AppAction;
  input?: string;
  error?: string;
  intentLabel?: string;
  contextNote?: string;
  requestedFocus?: string[];
  rawRequest?: string;
  analysisMode?: "default" | "youtube_fast" | "youtube_deep";
  retrievalOptions?: {
    limit?: number;
    sourceType?: SourceType;
    query?: string;
  };
}

export interface IngestedSource {
  sourceType: SourceType;
  sourceReference: string;
  rawInput: string;
  normalizedText: string;
  title?: string;
  authors?: string[];
  publication?: string;
  date?: string;
  completeness: Completeness;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface NormalizedRecord {
  id: string;
  slug: string;
  sourceType: SourceType;
  sourceReference: string;
  rawInput: string;
  normalizedText: string;
  title?: string;
  authors: string[];
  publication?: string;
  date?: string;
  completeness: Completeness;
  requestedAction: CanonicalAction;
  tags: string[];
  createdAt: string;
  model: string;
  status: "processed" | "failed";
  metadata: Record<string, unknown>;
}

export interface ActionArtifacts {
  reply: string;
  savedPaths: string[];
  output: string;
  recordId?: string;
}

export interface ActionContext {
  record: NormalizedRecord;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    caption?: string;
    chat: {
      id: number;
    };
  };
}

export interface AppConfig {
  port: number;
  telegramBotToken: string;
  openAiApiKey: string;
  openAiModel: string;
  openAiTimeoutMs: number;
  baseUrl: string;
  databaseUrl: string;
  supadataApiKey: string;
  fetchTranscriptApiKey: string;
  githubToken: string;
  githubRepo: string;
  githubBranch: string;
  archiveDir: string;
  contentBlogDir: string;
}

export interface PersistedRecordPayload {
  record: NormalizedRecord;
  outputs: {
    reply: string;
    output: string;
  };
  exportPaths: string[];
  githubSyncStatus?: "not_requested" | "pending" | "synced" | "failed";
  githubSyncTarget?: string;
}
