import { buildActionPrompt } from "../llm/prompts";
import { generateText } from "../llm/openai";
import type { CanonicalAction, NormalizedRecord } from "../types";

export async function generateActionOutput(action: CanonicalAction, record: NormalizedRecord): Promise<string> {
  const prompt = await buildActionPrompt(action, record);
  return generateText(prompt);
}
