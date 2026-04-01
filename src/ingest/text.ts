import type { IngestedSource } from "../types";

export async function ingestText(input: string): Promise<IngestedSource> {
  return {
    sourceType: "text",
    sourceReference: "inline:text",
    rawInput: input,
    normalizedText: input.trim(),
    completeness: "partial",
    tags: ["text"]
  };
}
