export function parseCommand(text: string) {
  const parts = text.trim().split(" ");
  const command = parts[0].toLowerCase();

  const supported = ["digest", "file", "summarize", "mdx"];

  if (!supported.includes(command)) {
    return {
      valid: false,
      error: "Invalid command. Use digest, file, summarize, or mdx."
    };
  }

  const input = parts.slice(1).join(" ");

  return {
    valid: true,
    command,
    input
  };
}