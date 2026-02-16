export function formatAiResponse(text: string) {
  if (!text) return [];

  const cleaned = text
    .replace(/\*\*/g, "")   // remove **
    .replace(/\*/g, "")     // remove *
    .replace(/\n+/g, "\n");

  return cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => ({
      id: idx,
      text: line,
      isHeading:
        line.toLowerCase().includes("summary") ||
        line.toLowerCase().includes("insight") ||
        line.toLowerCase().includes("next step"),
    }));
}
