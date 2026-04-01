const TELEGRAM_LIMIT = 4000;

export function chunkTelegramMessage(message: string): string[] {
  if (message.length <= TELEGRAM_LIMIT) {
    return [message];
  }

  const chunks: string[] = [];
  let remaining = message;

  while (remaining.length > TELEGRAM_LIMIT) {
    let cut = remaining.lastIndexOf("\n", TELEGRAM_LIMIT);
    if (cut < 1000) {
      cut = TELEGRAM_LIMIT;
    }

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

export function condenseTelegramReply(params: {
  reply: string;
  recordId?: string;
  analysisMode?: string;
}): string {
  const { reply, recordId, analysisMode } = params;

  if (analysisMode !== "youtube_deep") {
    return appendRecordReference(reply, recordId);
  }

  const condensed = extractDeepAnalysisSummary(reply);
  return appendRecordReference(condensed, recordId);
}

function appendRecordReference(reply: string, recordId?: string): string {
  if (!recordId) {
    return reply;
  }

  return `${reply.trim()}\n\nSaved full analysis: ${recordId}`;
}

function extractDeepAnalysisSummary(reply: string): string {
  const sections = [
    "Core takeaway",
    "Key points",
    "Why it matters",
    "Critical flags",
    "Physician-builder angle",
    "Physician-developer takeaway",
    "Recommended next step"
  ];

  const extracted: string[] = [];
  for (const section of sections) {
    const content = extractSection(reply, section);
    if (!content) {
      continue;
    }

    const trimmedContent =
      section === "Key points" || section === "Critical flags"
        ? limitBulletSection(content, 4)
        : limitBulletSection(content, 3);

    extracted.push(`${section}\n${trimmedContent}`);
  }

  if (extracted.length === 0) {
    return truncateReply(reply, 1800);
  }

  return truncateReply(extracted.join("\n\n"), 2200);
}

function extractSection(reply: string, heading: string): string | null {
  const escapedHeading = escapeRegExp(heading);
  const headings = [
    "Core takeaway",
    "Key points",
    "Why it matters",
    "Critical flags",
    "Physician-builder angle",
    "Physician-developer takeaway",
    "Recommended next step",
    "Deep YouTube analysis",
    "What this is",
    "Core claim",
    "What appears to be in the video",
    "Verified vs unverified",
    "Note on scope"
  ]
    .filter((item) => item !== heading)
    .map(escapeRegExp)
    .join("|");

  const regex = new RegExp(`(?:^|\\n)${escapedHeading}\\s*\\n([\\s\\S]*?)(?=\\n(?:${headings})\\s*\\n|$)`, "i");
  const match = reply.match(regex);
  return match?.[1]?.trim() ?? null;
}

function limitBulletSection(content: string, maxBullets: number): string {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const bulletLines = lines.filter((line) => line.startsWith("-"));
  if (bulletLines.length === 0) {
    return truncateReply(content, 400);
  }

  return bulletLines.slice(0, maxBullets).join("\n");
}

function truncateReply(reply: string, maxLength: number): string {
  if (reply.length <= maxLength) {
    return reply.trim();
  }

  return `${reply.slice(0, maxLength).trim()}...`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
