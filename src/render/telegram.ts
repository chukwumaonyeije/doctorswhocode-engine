const TELEGRAM_LIMIT = 4000;
const CONTINUED_PREFIX = "[continued]\n\n";

const DEEP_SECTION_PRIORITY: Array<{
  title: string;
  headings: string[];
  maxBullets?: number;
  maxLength?: number;
}> = [
  {
    title: "Source provenance",
    headings: ["Source provenance", "Provenance", "What this is", "Note on scope"],
    maxBullets: 4,
    maxLength: 420
  },
  {
    title: "Core takeaway",
    headings: ["Core takeaway", "Core claim", "Why this matters"],
    maxBullets: 3,
    maxLength: 520
  },
  {
    title: "Key points",
    headings: ["Key points", "What appears to be in the video", "What the review covers", "What the source actually supports"],
    maxBullets: 4,
    maxLength: 700
  },
  {
    title: "Critical flags",
    headings: ["Critical flags", "Verified vs unverified", "Where the evidence is thin", "Gaps and limitations highlighted by the authors"],
    maxBullets: 4,
    maxLength: 650
  },
  {
    title: "Physician-builder angle",
    headings: ["Physician-builder angle", "Physician-developer takeaway", "What changes when physicians build", "Physician-builder opportunities"],
    maxBullets: 4,
    maxLength: 650
  },
  {
    title: "Recommended next step",
    headings: ["Recommended next step", "Sensible next steps", "So build the pathway", "Conclusion"],
    maxBullets: 3,
    maxLength: 500
  }
];

export function chunkTelegramMessage(message: string): string[] {
  if (message.length <= TELEGRAM_LIMIT) {
    return [message];
  }

  const chunks: string[] = [];
  let remaining = message;

  while (remaining.length > TELEGRAM_LIMIT) {
    const availableLength = chunks.length === 0 ? TELEGRAM_LIMIT : TELEGRAM_LIMIT - CONTINUED_PREFIX.length;
    let cut = remaining.lastIndexOf("\n\n", availableLength);
    if (cut < 1000) {
      cut = remaining.lastIndexOf("\n", availableLength);
    }
    if (cut < 1000) {
      cut = availableLength;
    }

    const nextChunk = remaining.slice(0, cut).trim();
    chunks.push(chunks.length === 0 ? nextChunk : `${CONTINUED_PREFIX}${nextChunk}`);
    remaining = remaining.slice(cut).trim();
  }

  if (remaining.length > 0) {
    chunks.push(chunks.length === 0 ? remaining : `${CONTINUED_PREFIX}${remaining}`);
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
  const sections = parseSections(reply);
  const extracted = DEEP_SECTION_PRIORITY.map((section) => {
    const content = findFirstSectionContent(sections, section.headings);
    if (!content) {
      return null;
    }

    const formatted = formatSectionContent(content, {
      maxBullets: section.maxBullets ?? 3,
      maxLength: section.maxLength ?? 450
    });
    if (!formatted) {
      return null;
    }

    return `${section.title}\n${formatted}`;
  }).filter((value): value is string => Boolean(value));

  if (extracted.length === 0) {
    return truncateReply(compactParagraphs(reply), 2200);
  }

  const intro = "Deep YouTube read";
  return truncateReply([intro, ...extracted].join("\n\n"), 2600);
}

function parseSections(reply: string): Array<{ heading: string; content: string }> {
  const normalized = reply.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n");
  const sections: Array<{ heading: string; content: string }> = [];
  let currentHeading: string | null = null;
  let currentContent: string[] = [];

  const flush = (): void => {
    if (!currentHeading) {
      return;
    }

    sections.push({
      heading: currentHeading,
      content: currentContent.join("\n").trim()
    });
  };

  for (const line of lines) {
    const heading = parseHeadingLine(line);
    if (heading) {
      flush();
      currentHeading = heading;
      currentContent = [];
      continue;
    }

    if (!currentHeading) {
      currentHeading = "Introduction";
      currentContent = [];
    }

    currentContent.push(line);
  }

  flush();

  return sections.filter((section) => section.content.trim().length > 0);
}

function parseHeadingLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const markdownMatch = trimmed.match(/^#{1,6}\s+(.+?)\s*$/);
  if (markdownMatch) {
    return normalizeHeading(markdownMatch[1]);
  }

  const boldMatch = trimmed.match(/^\*\*(.+?)\*\*:?$/);
  if (boldMatch) {
    return normalizeHeading(boldMatch[1]);
  }

  if (/^[A-Za-z][A-Za-z0-9 /-]{2,80}:$/.test(trimmed)) {
    return normalizeHeading(trimmed.slice(0, -1));
  }

  if (/^[A-Z][A-Za-z0-9 /-]{2,80}$/.test(trimmed) && !/[.!?]$/.test(trimmed)) {
    return normalizeHeading(trimmed);
  }

  return null;
}

function findFirstSectionContent(
  sections: Array<{ heading: string; content: string }>,
  headings: string[]
): string | null {
  const normalizedTargets = headings.map(normalizeHeading);
  for (const target of normalizedTargets) {
    const matched = sections.find((section) => section.heading === target);
    if (matched?.content) {
      return matched.content;
    }
  }

  return null;
}

function formatSectionContent(
  content: string,
  options: {
    maxBullets: number;
    maxLength: number;
  }
): string {
  const bulletLines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^[-*]\s+/.test(line));

  if (bulletLines.length > 0) {
    return bulletLines
      .slice(0, options.maxBullets)
      .map((line) => simplifyBullet(line))
      .join("\n");
  }

  return truncateReply(compactParagraphs(content), options.maxLength);
}

function simplifyBullet(line: string): string {
  const normalized = line.replace(/^[-*]\s+/, "").replace(/\s+/g, " ").trim();
  const shortened = truncateReply(normalized, 180);
  return `- ${shortened}`;
}

function compactParagraphs(content: string): string {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.join(" ");
}

function truncateReply(reply: string, maxLength: number): string {
  if (reply.length <= maxLength) {
    return reply.trim();
  }

  return `${reply.slice(0, maxLength).trim()}...`;
}

function normalizeHeading(value: string): string {
  return value
    .trim()
    .replace(/[*_`#]+/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}
