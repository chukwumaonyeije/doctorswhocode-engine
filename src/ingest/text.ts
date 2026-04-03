import type { IngestedSource } from "../types";
import { AppError } from "../utils/errors";

export async function ingestText(input: string): Promise<IngestedSource> {
  const normalizedText = input.trim();
  if (!normalizedText) {
    throw new AppError("No usable text was found in that message. Paste the text directly or send a source URL.");
  }

  return {
    sourceType: "text",
    sourceReference: "inline:text",
    rawInput: input,
    normalizedText,
    completeness: "partial",
    tags: ["text"]
  };
}
