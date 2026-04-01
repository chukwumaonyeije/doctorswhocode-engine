import path from "path";
import dotenv from "dotenv";
import type { AppConfig } from "./types";

dotenv.config();

export const config: AppConfig = {
  port: Number(process.env.PORT ?? 3000),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-5",
  openAiTimeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? 120000),
  baseUrl: process.env.BASE_URL ?? "http://localhost:3000",
  databaseUrl: process.env.DATABASE_URL ?? "",
  supadataApiKey: process.env.SUPADATA_API_KEY ?? "",
  fetchTranscriptApiKey: process.env.FETCHTRANSCRIPT_API_KEY ?? "",
  githubToken: process.env.GITHUB_TOKEN ?? "",
  githubRepo: process.env.GITHUB_REPO ?? "chukwumaonyeije/doctorswhocode-engine",
  githubBranch: process.env.GITHUB_BRANCH ?? "main",
  archiveDir: path.resolve(process.cwd(), "archive"),
  contentBlogDir: path.resolve(process.cwd(), "content", "blog")
};

export function requireConfigValue(value: string, label: string): void {
  if (!value) {
    throw new Error(`Missing required config: ${label}`);
  }
}
