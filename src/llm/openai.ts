import axios from "axios";
import { config, requireConfigValue } from "../config";

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

  const response = await axios.post<ResponsesApiResponse>(
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
      timeout: 60000
    }
  );

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
