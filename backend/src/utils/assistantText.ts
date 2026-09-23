/** Keep internal property identifiers out of customer-facing assistant text. */
export function hidePropertyIds(text: string) {
  return text
    .replace(/^\s*[-*]\s*Property ID:\s*\S+\s*$/gim, "")
    .replace(/(^|\n)(\s*[-*]\s*)P\d{3,}\s*:\s*/gi, "$1$2")
    .replace(/\s*\((?:P\d{3,}|cm[a-z0-9]{16,})\)/gi, "")
    .replace(/\b(?:P\d{3,}|cm[a-z0-9]{16,})\b/gi, "the property")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
