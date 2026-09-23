export function parseInrAmount(raw: string): number | null {
  const match = raw.replace(/,/g, "").match(/(?:₹|inr|rs\.?\s*)?\s*(\d+(?:\.\d+)?)\s*(crore|crores|cr|lakh|lakhs|lac|lacs)?/i);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base) || base < 0) return null;
  const unit = match[2]?.toLowerCase();
  return Math.round(base * (unit?.startsWith("cr") || unit?.startsWith("crore") ? 10_000_000 : unit?.startsWith("la") ? 100_000 : 1));
}

export function explicitInrAmounts(message: string): number[] {
  const matches = message.matchAll(/(?:₹|inr|rs\.?\s*)\s*[\d,.]+(?:\.\d+)?\s*(?:crores?|cr|lakhs?|lacs?)?|\b[\d,.]+(?:\.\d+)?\s*(?:crores?|cr|lakhs?|lacs?)\b/gi);
  return [...matches]
    .map((match) => parseInrAmount(match[0]))
    .filter((value): value is number => value !== null);
}

export function explicitAddFacts(message: string): { valueInr: number | null; propertyType: string | null } {
  const valueMatch = message.match(/(?:worth|valued(?:\s+at)?|estimated(?:\s+at|\s+value(?:\s+of|\s+is)?)?|current\s+value(?:\s+of|\s+is)?|at)\s*((?:₹|inr|rs\.?\s*)?\s*[\d,.]+\s*(?:crores?|cr|lakhs?|lacs?)?)/i);
  const typeMatch = message.match(/\b(commercial\s+office|high[- ]street\s+retail|mall\s+retail|apartment|residential|commercial|retail|office|villa)\b/i);
  return {
    valueInr: valueMatch ? parseInrAmount(valueMatch[1]) : null,
    propertyType: typeMatch ? typeMatch[1].replace(/\s+/g, " ").toLowerCase() : null,
  };
}
