import modes from "../../configs/modes.json";
import type { CanonicalAction, ParsedCommand } from "../types";

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
    rawRequest: trimmed
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
    rawRequest: text
  };
}

function inferActionFromLanguage(text: string): CanonicalAction | undefined {
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

function buildIntentLabel(text: string, action: CanonicalAction): string {
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
