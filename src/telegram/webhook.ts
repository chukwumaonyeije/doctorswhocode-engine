import axios from "axios";
import { config, requireConfigValue } from "../config";
import { chunkTelegramMessage } from "../render/telegram";
import type { TelegramUpdate } from "../types";
import { handleIncomingText } from "./router";

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  const chatId = message?.chat.id;
  const text = message?.text ?? message?.caption;

  if (!chatId || !text) {
    return;
  }

  try {
    const result = await handleIncomingText(text);
    for (const chunk of chunkTelegramMessage(result.reply)) {
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
