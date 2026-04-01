import type { ActionArtifacts, ActionContext, CanonicalAction } from "../types";
import { runDigestAction } from "./digest";
import { runFileAction } from "./file";
import { runMdxAction } from "./mdx";
import { runSummarizeAction } from "./summarize";

export async function runAction(action: CanonicalAction, context: ActionContext): Promise<ActionArtifacts> {
  switch (action) {
    case "digest":
      return runDigestAction(context);
    case "file":
      return runFileAction(context);
    case "summarize":
      return runSummarizeAction(context);
    case "mdx":
      return runMdxAction(context);
    default: {
      const exhaustiveCheck: never = action;
      throw new Error(`Unhandled action: ${exhaustiveCheck}`);
    }
  }
}
