import express from "express";
import type { CanonicalAction } from "./types";
import { config } from "./config";
import { ingestPdfBase64, ingestPdfUrl } from "./ingest/pdf";
import { ensureDatabase, getDatabaseDiagnostics } from "./storage/db";
import { ensureStorageStructure } from "./storage/fs";
import { handleIncomingText, handleIngestedSourceAction } from "./telegram/router";
import { handleTelegramUpdate } from "./telegram/webhook";
import { logError, logInfo } from "./utils/logging";

async function startServer(): Promise<void> {
  await ensureStorageStructure();

  const app = express();
  app.use(express.json({ limit: "10mb" }));

  app.get("/health", (_request, response) => {
    const database = getDatabaseDiagnostics();
    const requiredConfig = {
      telegramBotToken: Boolean(config.telegramBotToken),
      openAiApiKey: Boolean(config.openAiApiKey),
      databaseUrl: Boolean(config.databaseUrl),
      baseUrl: Boolean(config.baseUrl)
    };
    const missingRequiredConfig = Object.entries(requiredConfig)
      .filter(([, present]) => !present)
      .map(([key]) => key);
    const dependencies = {
      config: {
        ready: missingRequiredConfig.length === 0,
        missing: missingRequiredConfig
      },
      database
    };
    const dependenciesReady = dependencies.config.ready && dependencies.database.ready;

    response.json({
      ok: dependenciesReady,
      service: "telegram-to-astro-research-agent",
      timestamp: new Date().toISOString(),
      app: {
        ready: true,
        uptimeSeconds: Math.round(process.uptime())
      },
      dependencies,
      summary: dependenciesReady ? "app_ready" : "degraded"
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

  app.post("/ingest/pdf", async (request, response) => {
    const action = normalizeCanonicalAction(request.body?.action);
    if (!action) {
      response.status(400).json({
        ok: false,
        error: "Request body must include action: digest, file, summarize, or mdx."
      });
      return;
    }

    const pdfUrl = typeof request.body?.url === "string" ? request.body.url.trim() : "";
    const base64 = typeof request.body?.base64 === "string" ? request.body.base64.trim() : "";

    if (!pdfUrl && !base64) {
      response.status(400).json({
        ok: false,
        error: "Request body must include either a PDF url or base64 payload."
      });
      return;
    }

    try {
      const ingested = pdfUrl
        ? await ingestPdfUrl(pdfUrl)
        : await ingestPdfBase64({
            base64,
            filename: typeof request.body?.filename === "string" ? request.body.filename : undefined,
            title: typeof request.body?.title === "string" ? request.body.title : undefined
          });

      const result = await handleIngestedSourceAction({
        action,
        ingested,
        rawRequest: pdfUrl ? `${action} ${pdfUrl}` : `${action} uploaded pdf`,
        intentLabel: "pdf_ingestion_endpoint",
        analysisMode: "default"
      });

      response.json({
        ok: true,
        reply: result.reply,
        savedPaths: result.savedPaths,
        recordId: result.recordId
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

  logInfo("database_init_started");
  ensureDatabase()
    .then(() => {
      logInfo("database_init_completed");
    })
    .catch((error) => {
      logError("database_init_failed", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
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

function normalizeCanonicalAction(value: unknown): CanonicalAction | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "digest" || normalized === "file" || normalized === "summarize" || normalized === "mdx") {
    return normalized;
  }

  return null;
}
