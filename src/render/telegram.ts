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
