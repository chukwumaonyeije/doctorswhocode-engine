import modes from "../../configs/modes.json";
import { normalizeSourceReference } from "../storage/sourceReferences";
import type { AppAction, CanonicalAction, CurationStatus, ParsedCommand, QueueSort, SourceType } from "../types";

const aliasMap = new Map<string, CanonicalAction>();
const orderedAliases: string[] = [];

for (const [action, value] of Object.entries(modes)) {
  for (const alias of value.aliases) {
    const normalizedAlias = alias.toLowerCase();
    aliasMap.set(normalizedAlias, action as CanonicalAction);
    orderedAliases.push(normalizedAlias);
  }
}

const canonicalActions = new Set<CanonicalAction>(["digest", "file", "summarize", "mdx"]);
orderedAliases.sort((left, right) => right.length - left.length);

export function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: "No command detected. Use digest, file, summarize, or mdx."
    };
  }

  const retrievalCommand = parseRetrievalCommand(trimmed);
  if (retrievalCommand) {
    return retrievalCommand;
  }

  const queueViewCommand = parseQueueViewCommand(trimmed);
  if (queueViewCommand) {
    return queueViewCommand;
  }

  const queueCommand = parseQueueCommand(trimmed);
  if (queueCommand) {
    return queueCommand;
  }

  const lower = trimmed.toLowerCase();
  const matchedAlias = orderedAliases.find((alias) => lower === alias || lower.startsWith(`${alias} `));
  const action = matchedAlias ? resolveAction(matchedAlias) : resolveAction(trimmed.split(/\s+/)[0].toLowerCase());

  if (!action) {
    const inferred = inferNaturalLanguageCommand(trimmed);
    if (inferred) {
      return inferred;
    }

    return {
      valid: false,
      error: "Could not infer the request. Try digest, file, summarize, mdx, or ask more explicitly."
    };
  }

  const input = matchedAlias ? trimmed.slice(matchedAlias.length).trim() : trimmed.split(/\s+/).slice(1).join(" ").trim();

  if (!input) {
    return {
      valid: false,
      error: `Missing input. Example: ${action} https://example.com/article`
    };
  }

  return {
    valid: true,
    action,
    input,
    intentLabel: "canonical_command",
    rawRequest: trimmed,
    analysisMode: inferAnalysisMode({
      action,
      input,
      intentLabel: "canonical_command",
      requestedFocus: []
    })
  };
}

function resolveAction(value: string): CanonicalAction | undefined {
  if (canonicalActions.has(value as CanonicalAction)) {
    return value as CanonicalAction;
  }

  return aliasMap.get(value);
}

function inferNaturalLanguageCommand(text: string): ParsedCommand | null {
  const lower = text.toLowerCase();
  const action = inferActionFromLanguage(lower);
  const input = extractInputReference(text);

  if (!action || !input) {
    return null;
  }

  return {
    valid: true,
    action,
    input,
    intentLabel: buildIntentLabel(lower, action),
    contextNote: extractContextNote(text, input),
    requestedFocus: inferRequestedFocus(lower),
    rawRequest: text,
    analysisMode: inferAnalysisMode({
      action: action === "queue" ? "mdx" : action,
      input,
      intentLabel: buildIntentLabel(lower, action),
      requestedFocus: inferRequestedFocus(lower)
    })
  };
}

function inferActionFromLanguage(text: string): CanonicalAction | "queue" | undefined {
  if (/\b(analy[sz]e and draft|queue for blog|queue this for blog|analy[sz]e and queue|create a blog draft and queue)\b/i.test(text)) {
    return "queue";
  }

  if (/\b(mdx|blog post|blog draft|astro blog|write a blog|turn .* into .*blog|make .*blog|article draft)\b/i.test(text)) {
    return "mdx";
  }

  if (/\b(file|archive|save this|store this|knowledge note|keep this|save this for later)\b/i.test(text)) {
    return "file";
  }

  if (/\b(summarize|summary|analyze|analyse|extract useful information|what's in|what is in|review this|what are the risks|what matters|critical flags|red flags|core findings)\b/i.test(text)) {
    return "summarize";
  }

  if (/\b(digest|quick takeaways|key points|core takeaway|why it matters|brief me)\b/i.test(text)) {
    return "digest";
  }

  if (/(https?:\/\/|youtu\.be|youtube\.com|pubmed\.ncbi\.nlm\.nih\.gov|PMID:\s*\d+)/i.test(text)) {
    return "digest";
  }

  return undefined;
}

function extractInputReference(text: string): string | undefined {
  const urlMatch = text.match(/https?:\/\/\S+/i);
  if (urlMatch) {
    return urlMatch[0].replace(/[),.;]+$/, "");
  }

  const pmidMatch = text.match(/(?:PMID:\s*)?\d{5,12}/i);
  if (pmidMatch) {
    return pmidMatch[0];
  }

  const fromThisMatch = text.match(/\b(?:from|of|about)\s+(.+)$/i);
  if (fromThisMatch) {
    return fromThisMatch[1].trim();
  }

  return undefined;
}

function extractContextNote(text: string, input: string): string | undefined {
  const withoutInput = text.replace(input, "").trim();
  const forMatch = withoutInput.match(/\bfor\s+(.+)$/i);
  if (forMatch) {
    return forMatch[1].trim();
  }

  return withoutInput.length > 0 ? withoutInput : undefined;
}

function inferRequestedFocus(text: string): string[] {
  const focus: string[] = [];

  if (/\b(risk|risks|flag|flags|critical|red flag)\b/i.test(text)) {
    focus.push("critical_flags");
  }

  if (/\b(physician developer|physician-builder|doctor developer|clinical workflow)\b/i.test(text)) {
    focus.push("physician_builder");
  }

  if (/\b(blog|mdx|publish|article)\b/i.test(text)) {
    focus.push("publishable_output");
  }

  if (/\b(project|implementation|build|architecture|system)\b/i.test(text)) {
    focus.push("implementation_context");
  }

  return focus;
}

function buildIntentLabel(text: string, action: CanonicalAction | "queue"): string {
  if (/\b(critical flags|red flags|risks)\b/i.test(text)) {
    return "risk_review";
  }

  if (/\b(knowledge note|save this|archive)\b/i.test(text)) {
    return "knowledge_capture";
  }

  if (/\b(blog|mdx|article)\b/i.test(text)) {
    return "publish_request";
  }

  return `natural_language_${action}`;
}

function inferAnalysisMode(params: {
  action: CanonicalAction;
  input: string;
  intentLabel?: string;
  requestedFocus?: string[];
}): "default" | "youtube_fast" | "youtube_deep" {
  const isYouTube = /(youtube\.com|youtu\.be)/i.test(params.input);
  if (!isYouTube) {
    return "default";
  }

  const hasRichIntent =
    params.intentLabel !== "canonical_command" ||
    params.action === "summarize" ||
    params.action === "mdx" ||
    (params.requestedFocus ?? []).length > 0;

  return hasRichIntent ? "youtube_deep" : "youtube_fast";
}

export function buildDeepYouTubeAcknowledgement(parsed: ParsedCommand): string | null {
  if (parsed.analysisMode !== "youtube_deep") {
    return null;
  }

  if (parsed.requestedFocus?.includes("physician_builder")) {
    return "Analyzing this video now. I’m extracting what I can and will return with a deeper physician-developer reading.";
  }

  return "Analyzing this video now. I’m extracting what I can and will return with a deeper source-aware reading.";
}

function parseRetrievalCommand(text: string): ParsedCommand | null {
  if (/^(?:pdf|export\s+pdf)$/i.test(text.trim())) {
    return {
      valid: false,
      error: "Missing record ID. Example: pdf 00bbfa8e03e87849."
    };
  }

  const showMatch = text.match(/^(?:show|retrieve)\s+([a-f0-9]{8,32})$/i);
  if (showMatch) {
    return {
      valid: true,
      action: "retrieve",
      input: showMatch[1],
      intentLabel: "record_retrieval",
      rawRequest: text,
      analysisMode: "default"
    };
  }

  const showSourceMatch = text.match(/^(?:show|retrieve)\s+(.+)$/i);
  if (showSourceMatch) {
    const sourceReference = normalizeRetrievalSourceReference(showSourceMatch[1]);
    if (sourceReference) {
      return {
        valid: true,
        action: "retrieve",
        input: sourceReference,
        intentLabel: "source_retrieval",
        rawRequest: text,
        analysisMode: "default"
      };
    }
  }

  const mdxFromRecordMatch = text.match(/^(?:mdx|blog)\s+([a-f0-9]{8,32})$/i);
  if (mdxFromRecordMatch) {
    return {
      valid: true,
      action: "mdx",
      input: mdxFromRecordMatch[1],
      intentLabel: "mdx_from_record",
      rawRequest: text,
      analysisMode: "default"
    };
  }

  const pdfFromRecordMatch = text.match(/^(?:pdf|export\s+pdf)\s+([a-f0-9]{8,32})$/i);
  if (pdfFromRecordMatch) {
    return {
      valid: true,
      action: "pdf",
      input: pdfFromRecordMatch[1],
      intentLabel: "pdf_from_record",
      rawRequest: text,
      analysisMode: "default"
    };
  }

  const markMatch = text.match(/^(?:mark|set)\s+([a-f0-9]{8,32})\s+(new|reviewed|drafted|publish_ready|publish-ready|archived)$/i);
  if (markMatch) {
    return {
      valid: true,
      action: "curate",
      input: markMatch[1],
      intentLabel: "curation_update",
      rawRequest: text,
      analysisMode: "default",
      curationOptions: {
        recordId: markMatch[1],
        status: normalizeCurationStatus(markMatch[2])!
      }
    };
  }

  const promoteMatch = text.match(/^(?:promote|demote)\s+([a-f0-9]{8,32})\s+(new|reviewed|drafted|publish_ready|publish-ready|archived)$/i);
  if (promoteMatch) {
    return {
      valid: true,
      action: "curate",
      input: promoteMatch[1],
      intentLabel: "curation_update",
      rawRequest: text,
      analysisMode: "default",
      curationOptions: {
        recordId: promoteMatch[1],
        status: normalizeCurationStatus(promoteMatch[2])!
      }
    };
  }

  const searchMatch = text.match(/^(?:find|search)\s+(.+)$/i);
  if (searchMatch) {
    const rawTerms = searchMatch[1].trim();
    const parts = rawTerms.split(/\s+/);
    let limit: number | undefined;
    let sourceType: SourceType | undefined;
    let curationStatus: CurationStatus | undefined;
    let createdAfter: string | undefined;
    let createdBefore: string | undefined;
    const topics: string[] = [];
    const queryParts: string[] = [];

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      if (!limit && isTrailingLimitToken(parts, index)) {
        limit = Number(part);
        continue;
      }

      const dateFilter = parseDateFilter(part);
      if (dateFilter) {
        if ("type" in dateFilter) {
          return {
            valid: false,
            error: dateFilter.error
          };
        }

        if (dateFilter.kind === "after") {
          createdAfter = dateFilter.value;
        } else {
          createdBefore = dateFilter.value;
        }
        continue;
      }

      const topicFilter = parseTopicFilter(part);
      if (topicFilter) {
        topics.push(topicFilter);
        continue;
      }

      const normalized = normalizeSourceType(part);
      if (!sourceType && normalized) {
        sourceType = normalized;
        continue;
      }

      const normalizedStatus = normalizeCurationStatus(part);
      if (!curationStatus && normalizedStatus) {
        curationStatus = normalizedStatus;
        continue;
      }

      queryParts.push(part);
    }

    const query = queryParts.join(" ").trim();
    if (!query) {
      return {
        valid: false,
        error: "Missing search terms. Example: find cerclage or search youtube telemetry."
      };
    }

    return {
      valid: true,
      action: "search",
      input: query,
      intentLabel: "record_search",
      rawRequest: text,
      analysisMode: "default",
      retrievalOptions: {
        limit,
        sourceType,
        topics: topics.length > 0 ? [...new Set(topics)] : undefined,
        createdAfter,
        createdBefore,
        curationStatus,
        query
      }
    };
  }

  if (/^recent\b/i.test(text)) {
    const parts = text.trim().split(/\s+/).slice(1);
    let limit: number | undefined;
    let sourceType: SourceType | undefined;
    let curationStatus: CurationStatus | undefined;
    let createdAfter: string | undefined;
    let createdBefore: string | undefined;
    const topics: string[] = [];

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      if (!limit && isTrailingLimitToken(parts, index)) {
        limit = Number(part);
        continue;
      }

      const dateFilter = parseDateFilter(part);
      if (dateFilter) {
        if ("type" in dateFilter) {
          return {
            valid: false,
            error: dateFilter.error
          };
        }

        if (dateFilter.kind === "after") {
          createdAfter = dateFilter.value;
        } else {
          createdBefore = dateFilter.value;
        }
        continue;
      }

      const topicFilter = parseTopicFilter(part);
      if (topicFilter) {
        topics.push(topicFilter);
        continue;
      }

      const normalized = normalizeSourceType(part);
      if (normalized) {
        sourceType = normalized;
        continue;
      }

      const normalizedStatus = normalizeCurationStatus(part);
      if (normalizedStatus) {
        curationStatus = normalizedStatus;
      }
    }

    return {
      valid: true,
      action: "recent",
      input: "recent",
      intentLabel: "recent_records",
      rawRequest: text,
      analysisMode: "default",
      retrievalOptions: {
        limit,
        sourceType,
        topics: topics.length > 0 ? [...new Set(topics)] : undefined,
        createdAfter,
        createdBefore,
        curationStatus
      }
    };
  }

  return null;
}

function parseQueueCommand(text: string): ParsedCommand | null {
  const draftFromRecordMatch = text.match(/^(?:draft)\s+([a-f0-9]{8,32})$/i);
  if (draftFromRecordMatch) {
    return {
      valid: true,
      action: "mdx",
      input: draftFromRecordMatch[1],
      intentLabel: "mdx_from_record",
      rawRequest: text,
      analysisMode: "default"
    };
  }

  const queueMatch = text.match(
    /^(?:draft|analy[sz]e and draft|queue(?:\s+for\s+blog)?|analy[sz]e and queue|queue this for blog)\s+(.+)$/i
  );
  if (!queueMatch) {
    return null;
  }

  const input = queueMatch[1].trim();
  if (!input) {
    return {
      valid: false,
      error: "Missing input. Example: draft https://example.com/article"
    };
  }

  const requestedFocus = ["publishable_output", ...inferRequestedFocus(text)];

  return {
    valid: true,
    action: "queue",
    input,
    intentLabel: "compound_analyze_and_draft",
    contextNote: extractContextNote(text, input),
    requestedFocus: [...new Set(requestedFocus)],
    rawRequest: text,
    analysisMode: inferAnalysisMode({
      action: "mdx",
      input,
      intentLabel: "compound_analyze_and_draft",
      requestedFocus
    })
  };
}

function parseQueueViewCommand(text: string): ParsedCommand | null {
  const queueMatch = text.match(/^queue(?:\s+(.+))?$/i);
  if (!queueMatch) {
    return null;
  }

  const rawTerms = queueMatch[1]?.trim() ?? "";
  const parts = rawTerms ? rawTerms.split(/\s+/) : [];
  let limit: number | undefined;
  let sourceType: SourceType | undefined;
  let createdAfter: string | undefined;
  let createdBefore: string | undefined;
  let queueSort: QueueSort | undefined;
  const topics: string[] = [];
  const statuses: CurationStatus[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!limit && isTrailingLimitToken(parts, index)) {
      limit = Number(part);
      continue;
    }

    const dateFilter = parseDateFilter(part);
    if (dateFilter) {
      if ("type" in dateFilter) {
        return {
          valid: false,
          error: dateFilter.error
        };
      }

      if (dateFilter.kind === "after") {
        createdAfter = dateFilter.value;
      } else {
        createdBefore = dateFilter.value;
      }
      continue;
    }

    const topicFilter = parseTopicFilter(part);
    if (topicFilter) {
      topics.push(topicFilter);
      continue;
    }

    const normalizedSort = normalizeQueueSort(part);
    if (!queueSort && normalizedSort) {
      queueSort = normalizedSort;
      continue;
    }

    const normalizedSource = normalizeSourceType(part);
    if (!sourceType && normalizedSource) {
      sourceType = normalizedSource;
      continue;
    }

    const normalizedStatus = normalizeQueueStatus(part);
    if (normalizedStatus) {
      statuses.push(normalizedStatus);
      continue;
    }

    return null;
  }

  return {
    valid: true,
    action: "queue_view",
    input: "queue",
    intentLabel: "editorial_queue",
    rawRequest: text,
    analysisMode: "default",
    retrievalOptions: {
      limit,
      sourceType,
      topics: topics.length > 0 ? [...new Set(topics)] : undefined,
      createdAfter,
      createdBefore,
      curationStatuses: statuses.length > 0 ? [...new Set(statuses)] : undefined,
      queueSort
    }
  };
}

function normalizeSourceType(value: string): SourceType | undefined {
  const normalized = value.toLowerCase();
  const allowed: SourceType[] = [
    "text",
    "webpage",
    "pdf_document",
    "pubmed",
    "research_article",
    "transcript",
    "audio_transcript",
    "unknown"
  ];

  return allowed.includes(normalized as SourceType) ? (normalized as SourceType) : undefined;
}

function normalizeCurationStatus(value: string): CurationStatus | undefined {
  const normalized = value.toLowerCase().replace(/-/g, "_");
  const allowed: CurationStatus[] = ["new", "reviewed", "drafted", "publish_ready", "archived"];
  return allowed.includes(normalized as CurationStatus) ? (normalized as CurationStatus) : undefined;
}

function normalizeQueueStatus(value: string): CurationStatus | undefined {
  const normalized = value.toLowerCase().replace(/-/g, "_");
  if (normalized === "blog") {
    return "drafted";
  }
  if (normalized === "ready") {
    return "publish_ready";
  }
  if (normalized === "review") {
    return "reviewed";
  }

  return normalizeCurationStatus(normalized);
}

function normalizeQueueSort(value: string): QueueSort | undefined {
  const normalized = value.toLowerCase().replace(/-/g, "_");
  if (normalized === "priority" || normalized === "oldest" || normalized === "newest") {
    return normalized;
  }

  if (normalized === "stale" || normalized === "aging" || normalized === "aged") {
    return "oldest";
  }

  if (normalized === "recent" || normalized === "latest") {
    return "newest";
  }

  return undefined;
}

function normalizeRetrievalSourceReference(value: string): string | null {
  const trimmed = value.trim().replace(/[),.;]+$/, "");

  if (/^https?:\/\//i.test(trimmed)) {
    return normalizeSourceReference(trimmed);
  }

  const pmidMatch = trimmed.match(/^(?:PMID:\s*)?(\d{5,12})$/i);
  if (pmidMatch) {
    return normalizeSourceReference(`PMID:${pmidMatch[1]}`);
  }

  return null;
}

function parseDateFilter(
  part: string
):
  | { kind: "after" | "before"; value: string }
  | { type: "invalid"; error: string }
  | null {
  const matched = part.match(/^(after|before):(.+)$/i);
  if (!matched) {
    return null;
  }

  const kind = matched[1].toLowerCase() as "after" | "before";
  const value = matched[2].trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return {
      type: "invalid",
      error: `Invalid ${kind} filter. Use ${kind}:YYYY-MM-DD, for example ${kind}:2026-04-01.`
    };
  }

  return { kind, value };
}

function parseTopicFilter(part: string): string | null {
  const matched = part.match(/^(?:topic|tag):(.+)$/i);
  if (!matched) {
    return null;
  }

  const value = matched[1].trim();
  return value.length > 0 ? value.toLowerCase() : null;
}

function isTrailingLimitToken(parts: string[], index: number): boolean {
  const part = parts[index];
  if (!/^\d+$/.test(part)) {
    return false;
  }

  if (index !== parts.length - 1) {
    return false;
  }

  return index > 0;
}
