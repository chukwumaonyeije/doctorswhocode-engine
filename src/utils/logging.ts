export function logInfo(message: string, meta?: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: "info", message, ...meta }));
}

export function logError(message: string, meta?: Record<string, unknown>): void {
  console.error(JSON.stringify({ level: "error", message, ...meta }));
}

export function createRequestId(prefix = "req"): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

export function logSourceCounter(params: {
  source: string;
  outcome: "success" | "failure";
  requestId?: string;
  classifiedSource?: string;
  resolvedSourceType?: string;
  completeness?: string;
  detail?: string;
}): void {
  logInfo("source_ingest_counter", {
    metric: "source_ingest_total",
    counterIncrement: 1,
    source: params.source,
    outcome: params.outcome,
    requestId: params.requestId,
    classifiedSource: params.classifiedSource,
    resolvedSourceType: params.resolvedSourceType,
    completeness: params.completeness,
    detail: params.detail
  });
}
