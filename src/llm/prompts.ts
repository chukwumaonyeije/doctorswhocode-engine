import fs from "fs/promises";
import path from "path";
import type { CanonicalAction, NormalizedRecord } from "../types";

const promptCache = new Map<CanonicalAction, string>();

export async function loadPrompt(action: CanonicalAction): Promise<string> {
  if (promptCache.has(action)) {
    return promptCache.get(action)!;
  }

  const filePath = path.resolve(process.cwd(), "prompts", `${action}.md`);
  const contents = await fs.readFile(filePath, "utf8");
  promptCache.set(action, contents);
  return contents;
}

export async function buildActionPrompt(action: CanonicalAction, record: NormalizedRecord): Promise<string> {
  const basePrompt = await loadPrompt(action);
  const sourceAwareInstructions = buildSourceAwareInstructions(record);
  const voiceInstructions = buildVoiceInstructions(action, record);
  const serializedRecord = JSON.stringify(
    {
      id: record.id,
      sourceType: record.sourceType,
      sourceReference: record.sourceReference,
      title: record.title,
      authors: record.authors,
      publication: record.publication,
      date: record.date,
      completeness: record.completeness,
      tags: record.tags,
      createdAt: record.createdAt,
      userIntent: record.metadata.userIntent,
      intentLabel: record.metadata.intentLabel,
      contextNote: record.metadata.contextNote,
      requestedFocus: record.metadata.requestedFocus,
      analysisMode: record.metadata.analysisMode
    },
    null,
    2
  );

  return [
    basePrompt.trim(),
    sourceAwareInstructions,
    voiceInstructions,
    "",
    "Record metadata:",
    serializedRecord,
    "",
    "Normalized source text:",
    record.normalizedText
  ].join("\n");
}

function buildSourceAwareInstructions(record: NormalizedRecord): string {
  if (record.metadata.analysisMode === "youtube_deep") {
    return [
      "You are performing a deep YouTube analysis.",
      "Use this structure:",
      "- What this is",
      "- Core claim",
      "- What appears to be in the video",
      "- Verified vs unverified",
      "- Physician-developer takeaway",
      "- Critical flags",
      "- Recommended next step",
      "If transcript text is unavailable, state clearly that the analysis is based on metadata only and do not imply full-video access.",
      "Use the user's context note and requested focus to shape the analysis."
    ].join("\n");
  }

  return "";
}

function buildVoiceInstructions(action: CanonicalAction, record: NormalizedRecord): string {
  if (action !== "mdx") {
    return "";
  }

  const wantsPublishableOutput =
    record.tags.includes("publishable_output") ||
    record.metadata.intentLabel === "publish_request" ||
    record.metadata.intentLabel === "mdx_from_record" ||
    record.metadata.intentLabel === "compound_analyze_and_draft";

  if (!wantsPublishableOutput) {
    return "";
  }

  return [
    "Write for DoctorsWhoCode.blog.",
    "Use first person when a direct physician-builder perspective strengthens the argument.",
    "Keep paragraphs short.",
    "Prefer clear declarative sentences over balanced committee language.",
    "Name what is structurally broken, explain why it persists, and show what changes when physicians build.",
    "Do not sound like a generic medical explainer or a corporate AI blog.",
    "If evidence is partial, state the limit plainly but keep the argument strong and readable."
  ].join("\n");
}
