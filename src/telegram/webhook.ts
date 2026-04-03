import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { config, requireConfigValue } from "../config";
import { ingestPdfBase64 } from "../ingest/pdf";
import { chunkTelegramMessage, condenseTelegramReply } from "../render/telegram";
import type { CanonicalAction, TelegramMessage, TelegramUpdate } from "../types";
import { formatTelegramError } from "../utils/errors";
import { createRequestId, logError, logInfo, logStage } from "../utils/logging";
import { handleIngestedSourceAction, handleParsedCommand } from "./router";
import { buildDeepYouTubeAcknowledgement, parseCommand } from "./parseCommand";

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const message = getTelegramMessage(update);
  const chatId = message?.chat.id;
  const text = message?.text ?? message?.caption;
  const document = message?.document;

  if (!chatId) {
    return;
  }

  const requestId = createRequestId("tg");

  try {
    logInfo("telegram_update_received", {
      requestId,
      updateId: update.update_id,
      hasMessage: Boolean(update.message),
      hasEditedMessage: Boolean(update.edited_message),
      hasChannelPost: Boolean(update.channel_post),
      hasEditedChannelPost: Boolean(update.edited_channel_post),
      hasDocument: Boolean(document),
      hasCaption: Boolean(message?.caption),
      hasText: Boolean(message?.text)
    });

    if (document) {
      await handleTelegramDocumentMessage({
        chatId,
        text,
        document,
        requestId
      });
      return;
    }

    if (!text) {
      return;
    }

    const parsed = parseCommand(text);
    parsed.requestId = requestId;

    logInfo("telegram_request_received", {
      requestId,
      updateId: update.update_id,
      chatId,
      hasCaption: Boolean(message?.caption),
      textLength: text.length
    });

    if (!parsed.valid) {
      logInfo("telegram_request_rejected", {
        requestId,
        updateId: update.update_id,
        reason: parsed.error ?? "Could not understand the request."
      });
      await sendTelegramMessage(chatId, parsed.error ?? "Could not understand the request.");
      return;
    }

    logInfo("telegram_command_parsed", {
      requestId,
      action: parsed.action,
      intentLabel: parsed.intentLabel,
      analysisMode: parsed.analysisMode
    });

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

    const replyChunks = chunkTelegramMessage(telegramReply);
    logInfo("telegram_reply_prepared", {
      requestId,
      action: parsed.action,
      chunkCount: replyChunks.length,
      replyLength: telegramReply.length,
      recordId: result.recordId
    });

    for (const [index, chunk] of replyChunks.entries()) {
      logStage({
        requestId,
        stage: "telegram_send_message",
        status: "started",
        action: parsed.action,
        detail: `Sending chunk ${index + 1} of ${replyChunks.length}`,
        meta: {
          chunkIndex: index + 1,
          chunkLength: chunk.length
        }
      });
      await sendTelegramMessage(chatId, chunk);
      logStage({
        requestId,
        stage: "telegram_send_message",
        status: "completed",
        action: parsed.action,
        detail: `Sent chunk ${index + 1} of ${replyChunks.length}`,
        meta: {
          chunkIndex: index + 1,
          chunkLength: chunk.length
        }
      });
    }

    const pdfPath = result.savedPaths.find((savedPath) => savedPath.toLowerCase().endsWith(".pdf"));
    if (pdfPath) {
      logStage({
        requestId,
        stage: "telegram_send_document",
        status: "started",
        action: parsed.action,
        detail: pdfPath
      });
      await sendTelegramDocument(chatId, pdfPath, `PDF export for record ${result.recordId ?? path.basename(pdfPath, ".pdf")}`);
      logStage({
        requestId,
        stage: "telegram_send_document",
        status: "completed",
        action: parsed.action,
        detail: pdfPath
      });
    }

    logInfo("telegram_request_completed", {
      requestId,
      action: parsed.action,
      recordId: result.recordId,
      savedPaths: result.savedPaths.length
    });
  } catch (error) {
    logError("telegram_request_failed", {
      requestId,
      updateId: update.update_id,
      error: error instanceof Error ? error.message : String(error)
    });
    const reply = formatTelegramError(error);
    await sendTelegramMessage(chatId, reply);
  }
}

async function handleTelegramDocumentMessage(params: {
  chatId: number;
  text?: string;
  document: TelegramMessage["document"];
  requestId: string;
}): Promise<void> {
  const { chatId, text, document, requestId } = params;

  logInfo("telegram_document_received", {
    requestId,
    fileName: document?.file_name,
    mimeType: document?.mime_type,
    fileSize: document?.file_size
  });

  if (!document || !isPdfDocument(document)) {
    await sendTelegramMessage(
      chatId,
      "Only PDF document uploads are supported right now. Send a PDF with a caption like digest, file, summarize, or mdx."
    );
    return;
  }

  const inferred = inferUploadedPdfRequest(text);
  if (!inferred) {
    await sendTelegramMessage(
      chatId,
      "Add a caption telling me what to do with the PDF: digest, file, summarize, or mdx."
    );
    return;
  }

  const fileBytes = await downloadTelegramFile(document.file_id);
  const ingested = await ingestPdfBase64({
    base64: fileBytes.toString("base64"),
    filename: document.file_name,
    title: stripPdfExtension(document.file_name ?? "")
  });

  const result = await handleIngestedSourceAction({
    action: inferred.action,
    ingested,
    requestId,
    rawRequest: inferred.rawRequest,
    intentLabel: inferred.intentLabel,
    requestedFocus: inferred.requestedFocus,
    analysisMode: "default"
  });

  const telegramReply = condenseTelegramReply({
    reply: result.reply,
    recordId: result.recordId,
    analysisMode: "default"
  });

  const replyChunks = chunkTelegramMessage(telegramReply);
  logInfo("telegram_reply_prepared", {
    requestId,
    action: inferred.action,
    chunkCount: replyChunks.length,
    replyLength: telegramReply.length,
    recordId: result.recordId
  });

  for (const [index, chunk] of replyChunks.entries()) {
    logStage({
      requestId,
      stage: "telegram_send_message",
      status: "started",
      action: inferred.action,
      detail: `Sending chunk ${index + 1} of ${replyChunks.length}`,
      meta: {
        chunkIndex: index + 1,
        chunkLength: chunk.length
      }
    });
    await sendTelegramMessage(chatId, chunk);
    logStage({
      requestId,
      stage: "telegram_send_message",
      status: "completed",
      action: inferred.action,
      detail: `Sent chunk ${index + 1} of ${replyChunks.length}`,
      meta: {
        chunkIndex: index + 1,
        chunkLength: chunk.length
      }
    });
  }

  const pdfPath = result.savedPaths.find((savedPath) => savedPath.toLowerCase().endsWith(".pdf"));
  if (pdfPath) {
    logStage({
      requestId,
      stage: "telegram_send_document",
      status: "started",
      action: inferred.action,
      detail: pdfPath
    });
    await sendTelegramDocument(chatId, pdfPath, `PDF export for record ${result.recordId ?? path.basename(pdfPath, ".pdf")}`);
    logStage({
      requestId,
      stage: "telegram_send_document",
      status: "completed",
      action: inferred.action,
      detail: pdfPath
    });
  }

  logInfo("telegram_document_completed", {
    requestId,
    action: inferred.action,
    recordId: result.recordId,
    savedPaths: result.savedPaths.length
  });
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

export async function sendTelegramDocument(chatId: number, filePath: string, caption?: string): Promise<void> {
  requireConfigValue(config.telegramBotToken, "TELEGRAM_BOT_TOKEN");

  const fileBytes = await fs.readFile(filePath);
  const form = new FormData();
  const filename = path.basename(filePath);
  const blob = new Blob([fileBytes], { type: "application/pdf" });

  form.append("chat_id", String(chatId));
  form.append("document", blob, filename);
  if (caption) {
    form.append("caption", caption);
  }

  await axios.post(`https://api.telegram.org/bot${config.telegramBotToken}/sendDocument`, form, {
    timeout: 60000
  });
}

async function downloadTelegramFile(fileId: string): Promise<Buffer> {
  requireConfigValue(config.telegramBotToken, "TELEGRAM_BOT_TOKEN");

  const fileResponse = await axios.get<{ ok: boolean; result?: { file_path?: string } }>(
    `https://api.telegram.org/bot${config.telegramBotToken}/getFile`,
    {
      params: { file_id: fileId },
      timeout: 30000
    }
  );

  const filePath = fileResponse.data?.result?.file_path;
  if (!fileResponse.data?.ok || !filePath) {
    throw new Error("Telegram did not return a downloadable file path for that document.");
  }

  const downloadResponse = await axios.get<ArrayBuffer>(
    `https://api.telegram.org/file/bot${config.telegramBotToken}/${filePath}`,
    {
      responseType: "arraybuffer",
      timeout: 60000
    }
  );

  return Buffer.from(downloadResponse.data);
}

function isPdfDocument(document: TelegramMessage["document"]): boolean {
  if (!document) {
    return false;
  }

  return document.mime_type === "application/pdf" || /\.pdf$/i.test(document.file_name ?? "");
}

function inferUploadedPdfRequest(
  caption: string | undefined
): {
  action: CanonicalAction;
  rawRequest: string;
  intentLabel: string;
  requestedFocus?: string[];
} | null {
  const trimmed = caption?.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  const requestedFocus = inferUploadRequestedFocus(lower);

  if (/\b(mdx|blog|draft|article)\b/.test(lower)) {
    return {
      action: "mdx",
      rawRequest: trimmed,
      intentLabel: "telegram_pdf_upload_publish",
      requestedFocus
    };
  }

  if (/\b(file|archive|save)\b/.test(lower)) {
    return {
      action: "file",
      rawRequest: trimmed,
      intentLabel: "telegram_pdf_upload_archive",
      requestedFocus
    };
  }

  if (/\b(summarize|summary|analy[sz]e|review|risk|risks|flag|flags|what matters|what\'?s in)\b/.test(lower)) {
    const summaryFocus = lower.match(/\b(risk|risks|flag|flags)\b/) ? mergeRequestedFocus(requestedFocus, "critical_flags") : requestedFocus;
    return {
      action: "summarize",
      rawRequest: trimmed,
      intentLabel: /\b(risk|risks|flag|flags)\b/.test(lower) ? "telegram_pdf_upload_risk_review" : "telegram_pdf_upload_summary",
      requestedFocus: summaryFocus
    };
  }

  if (/\b(digest|takeaways|key points|brief|why it matters)\b/.test(lower)) {
    return {
      action: "digest",
      rawRequest: trimmed,
      intentLabel: "telegram_pdf_upload_digest",
      requestedFocus
    };
  }

  if (lower === "digest" || lower === "file" || lower === "summarize" || lower === "mdx") {
    return {
      action: lower as CanonicalAction,
      rawRequest: trimmed,
      intentLabel: "telegram_pdf_upload",
      requestedFocus
    };
  }

  if (requestedFocus.length > 0) {
    return {
      action: "summarize",
      rawRequest: trimmed,
      intentLabel: "telegram_pdf_upload_summary",
      requestedFocus
    };
  }

  return null;
}

function stripPdfExtension(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/\.pdf$/i, "") || undefined;
}

function getTelegramMessage(update: TelegramUpdate): TelegramMessage | undefined {
  return update.message ?? update.edited_message ?? update.channel_post ?? update.edited_channel_post;
}

function inferUploadRequestedFocus(text: string): string[] {
  const focus: string[] = [];

  if (/\b(risk|risks|flag|flags|critical|red flag)\b/.test(text)) {
    focus.push("critical_flags");
  }

  if (/\b(physician developer|physician-builder|doctor developer|clinical workflow)\b/.test(text)) {
    focus.push("physician_builder");
  }

  if (/\b(blog|mdx|publish|article)\b/.test(text)) {
    focus.push("publishable_output");
  }

  if (/\b(project|implementation|build|architecture|system)\b/.test(text)) {
    focus.push("implementation_context");
  }

  return [...new Set(focus)];
}

function mergeRequestedFocus(existing: string[], next: string): string[] {
  return [...new Set([...existing, next])];
}
