import modes from "../../configs/modes.json";
import type { AppAction, CanonicalAction, CurationStatus, ParsedCommand, SourceType } from "../types";

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

  const searchMatch = text.match(/^(?:find|search)\s+(.+)$/i);
  if (searchMatch) {
    const rawTerms = searchMatch[1].trim();
    const parts = rawTerms.split(/\s+/);
    let limit: number | undefined;
    let sourceType: SourceType | undefined;
    let curationStatus: CurationStatus | undefined;
    const queryParts: string[] = [];

    for (const part of parts) {
      if (!limit && /^\d+$/.test(part)) {
        limit = Number(part);
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

    for (const part of parts) {
      if (!limit && /^\d+$/.test(part)) {
        limit = Number(part);
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

function normalizeSourceType(value: string): SourceType | undefined {
  const normalized = value.toLowerCase();
  const allowed: SourceType[] = [
    "text",
    "webpage",
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
