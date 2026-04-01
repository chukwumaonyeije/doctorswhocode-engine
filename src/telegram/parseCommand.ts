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
    return {
      valid: false,
      error: "Invalid command. Use digest, file, summarize, or mdx."
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
    input
  };
}

function resolveAction(value: string): CanonicalAction | undefined {
  if (canonicalActions.has(value as CanonicalAction)) {
    return value as CanonicalAction;
  }

  return aliasMap.get(value);
}
