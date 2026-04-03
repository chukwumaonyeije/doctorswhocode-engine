export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
  }
}

export function formatTelegramError(error: unknown): string {
  if (error instanceof AppError) {
    return normalizeErrorMessage(error.message);
  }

  if (error instanceof Error) {
    return normalizeErrorMessage(
      "That request failed before the analysis could finish. Try again, or switch to a direct URL, PMID, or pasted text."
    );
  }

  return "That request failed before the analysis could finish. Try again with a direct source or pasted text.";
}

function normalizeErrorMessage(message: string): string {
  return message
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}
