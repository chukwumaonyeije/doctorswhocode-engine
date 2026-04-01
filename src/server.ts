import express from "express";
import { config } from "./config";
import { ensureDatabase } from "./storage/db";
import { ensureStorageStructure } from "./storage/fs";
import { handleIncomingText } from "./telegram/router";
import { handleTelegramUpdate } from "./telegram/webhook";
import { logError, logInfo } from "./utils/logging";

async function startServer(): Promise<void> {
  await ensureStorageStructure();
  await ensureDatabase();

  const app = express();
  app.use(express.json({ limit: "10mb" }));

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      service: "telegram-to-astro-research-agent",
      timestamp: new Date().toISOString()
    });
  });

  app.post("/telegram/webhook", async (request, response) => {
    try {
      await handleTelegramUpdate(request.body);
      response.json({ ok: true });
    } catch (error) {
      logError("telegram_webhook_failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      response.status(500).json({ ok: false });
    }
  });

  app.post("/ingest", async (request, response) => {
    const text = String(request.body?.text ?? "").trim();

    if (!text) {
      response.status(400).json({
        ok: false,
        error: "Request body must include a text field."
      });
      return;
    }

    try {
      const result = await handleIncomingText(text);
      response.json({
        ok: true,
        reply: result.reply,
        savedPaths: result.savedPaths
      });
    } catch (error) {
      response.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.listen(config.port, () => {
    logInfo("server_started", {
      port: config.port,
      baseUrl: config.baseUrl
    });
  });
}

startServer().catch((error) => {
  logError("server_start_failed", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
  process.exit(1);
});
