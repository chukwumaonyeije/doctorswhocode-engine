import axios from "axios";
import { config, requireConfigValue } from "../config";
import { logError, logInfo } from "../utils/logging";

interface ResponsesApiOutputText {
  type: string;
  text?: string;
}

interface ResponsesApiOutputItem {
  type: string;
  content?: ResponsesApiOutputText[];
}

interface ResponsesApiResponse {
  output?: ResponsesApiOutputItem[];
  output_text?: string;
}

export async function generateText(prompt: string): Promise<string> {
  requireConfigValue(config.openAiApiKey, "OPENAI_API_KEY");

  logInfo("openai_request_started", {
    model: config.openAiModel,
    timeoutMs: config.openAiTimeoutMs,
    promptLength: prompt.length
  });

  let response;

  try {
    response = await axios.post<ResponsesApiResponse>(
      "https://api.openai.com/v1/responses",
      {
        model: config.openAiModel,
        input: prompt
      },
      {
        headers: {
          Authorization: `Bearer ${config.openAiApiKey}`,
          "Content-Type": "application/json"
        },
        timeout: config.openAiTimeoutMs
      }
    );
  } catch (error) {
    logError("openai_request_failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }

  logInfo("openai_request_completed", {
    model: config.openAiModel
  });

  const directText = response.data.output_text?.trim();
  if (directText) {
    return directText;
  }

  const joinedText = (response.data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("")
    .trim();

  if (!joinedText) {
    throw new Error("OpenAI response did not include text output.");
  }

  return joinedText;
}
