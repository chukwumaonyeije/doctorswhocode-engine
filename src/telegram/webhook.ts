import axios from "axios";
import { config, requireConfigValue } from "../config";
import { chunkTelegramMessage, condenseTelegramReply } from "../render/telegram";
import type { TelegramUpdate } from "../types";
import { handleParsedCommand } from "./router";
import { buildDeepYouTubeAcknowledgement, parseCommand } from "./parseCommand";

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  const chatId = message?.chat.id;
  const text = message?.text ?? message?.caption;

  if (!chatId || !text) {
    return;
  }

  try {
    const parsed = parseCommand(text);
    if (!parsed.valid) {
      await sendTelegramMessage(chatId, parsed.error ?? "Could not understand the request.");
      return;
    }

    const acknowledgement = buildDeepYouTubeAcknowledgement(parsed);
    if (acknowledgement) {
      await sendTelegramMessage(chatId, acknowledgement);
    }

    const result = await handleParsedCommand(parsed);
    const telegramReply = condenseTelegramReply({
      reply: result.reply,
      recordId: result.recordId,
      analysisMode: parsed.analysisMode
    });

    for (const chunk of chunkTelegramMessage(telegramReply)) {
      await sendTelegramMessage(chatId, chunk);
    }
  } catch (error) {
    const reply = error instanceof Error ? error.message : "An unexpected error occurred.";
    await sendTelegramMessage(chatId, reply);
  }
}

export async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  requireConfigValue(config.telegramBotToken, "TELEGRAM_BOT_TOKEN");

  await axios.post(
    `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
    {
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    },
    {
      timeout: 30000
    }
  );
}
