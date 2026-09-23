import { findMatchingProperties, updateProperty } from "../services/propertyService.js";

type ParsedAction = { kind: "update"; propertyQuery: string; changes: { currentEstimatedValueInr?: number; annualRentInr?: number; ownershipPercent?: number; occupancyStatus?: string } };

export type FastActionResult = {
  toolName: "add_property" | "update_property";
  input: unknown;
  output: unknown;
  answer: string;
};

function clean(value: string) {
  return value.trim().replace(/^(?:a|an|the|my)\s+/i, "").replace(/[.,!?]+$/, "").trim();
}

export function parseInrAmount(raw: string): number | null {
  const match = raw.replace(/,/g, "").match(/(?:₹|inr|rs\.?\s*)?\s*(\d+(?:\.\d+)?)\s*(crore|crores|cr|lakh|lakhs|lac|lacs)?/i);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base) || base < 0) return null;
  const unit = match[2]?.toLowerCase();
  return Math.round(base * (unit?.startsWith("cr") || unit?.startsWith("crore") ? 10_000_000 : unit?.startsWith("la") ? 100_000 : 1));
}

export function explicitAddFacts(message: string): { valueInr: number | null; propertyType: string | null } {
  const valueMatch = message.match(/(?:worth|valued(?:\s+at)?|estimated(?:\s+at|\s+value(?:\s+of|\s+is)?)?|current\s+value(?:\s+of|\s+is)?|at)\s*((?:₹|inr|rs\.?\s*)?\s*[\d,.]+\s*(?:crores?|cr|lakhs?|lacs?)?)/i);
  const typeMatch = message.match(/\b(commercial\s+office|high[- ]street\s+retail|mall\s+retail|apartment|residential|commercial|retail|office|villa)\b/i);
  return {
    valueInr: valueMatch ? parseInrAmount(valueMatch[1]) : null,
    propertyType: typeMatch ? typeMatch[1].replace(/\s+/g, " ").toLowerCase() : null,
  };
}

export function incompleteAddPropertyAnswer(message: string): string | null {
  if (!/^\s*(?:please\s+)?(?:add|create|record|save)\b/i.test(message)) return null;
  const facts = explicitAddFacts(message);
  const area = message.match(/\b(\d+(?:\.\d+)?)\s*(?:sq\.?\s*ft|sqft|square feet)\b/i);
  const locationAfterIn = message.match(/\b(?:in|at)\s+(.+?)(?=\s+(?:worth|valued|estimated|current\s+value)\b)/i)?.[1];
  const locationBeforeType = facts.propertyType
    ? message.match(new RegExp(`^\\s*(?:please\\s+)?(?:add|create|record|save)\\s+(?:a|an)?\\s*(.+?)\\s+${facts.propertyType.replace(/\s+/g, "\\s+")}\\s+(?:property\\s+)?(?:at|worth|valued|estimated)\\b`, "i"))?.[1]
    : null;
  const location = (locationAfterIn ?? locationBeforeType)?.replace(/^\d+(?:\.\d+)?\s*(?:sq\.?\s*ft|sqft|square feet)\s+/i, "").trim() ?? null;
  const has = {
    subtype: /\bsubtype\b|\bnot applicable\b/i.test(message),
    area: Boolean(area),
    purchasePrice: /\bpurchase\s+price\b|\bpurchased\s+(?:for|at)\b|\bpurchase\s+price\s+(?:unknown|not known)\b/i.test(message),
    annualRent: /\bannual\s+rent\b|\bno\s+rent\b|\brent\s+(?:not applicable|unknown)\b/i.test(message),
    occupancy: /\b(?:occupied|tenanted|vacant|self[- ]occupied)\b/i.test(message),
    tenantStatus: /\btenant\s+(?:status|name)\b|\bno\s+tenant\b|\btenant\s+not applicable\b/i.test(message),
    ownership: /\bownership\b|\b\d+(?:\.\d+)?\s*%\b|\bfully owned\b/i.test(message),
    status: /\b(?:record\s+)?status\s+(?:is\s+)?\w+/i.test(message),
  };
  const missing = [
    !facts.propertyType && "property type",
    !location && "location",
    !has.subtype && "subtype (or not applicable)",
    !has.area && "area in square feet",
    facts.valueInr === null && "current estimated value",
    !has.purchasePrice && "purchase price (or unknown)",
    !has.annualRent && "annual rent (or not applicable)",
    !has.occupancy && "occupancy status",
    !has.tenantStatus && "tenant status (or not applicable)",
    !has.ownership && "ownership percentage",
    !has.status && "record status, such as Active",
  ].filter((item): item is string => Boolean(item));
  if (!missing.length) return null;
  const known: string[] = [];
  if (location) known.push(`location ${location}`);
  if (facts.propertyType) known.push(`type ${facts.propertyType}`);
  if (facts.valueInr !== null) known.push(`estimated value ${formatMoney(facts.valueInr)}`);
  return `${known.length ? `I have ${known.join(", ")}. ` : ""}Before I add the property, please provide: ${missing.join(", ")}. No property has been added yet.`;
}

export function parsePortfolioAction(message: string): ParsedAction | null {
  const text = message.trim().replace(/[.!?]+$/, "");
  const update = text.match(/^(?:please\s+)?(?:update|change|set|edit|modify|revise)\s+(.+?)\s+(?:estimated\s+)?(?:property\s+)?value\s+(?:to|at)\s+(.+)$/i);
  if (update) {
    const amount = parseInrAmount(update[2]);
    return amount && amount > 0 ? { kind: "update", propertyQuery: clean(update[1]), changes: { currentEstimatedValueInr: amount } } : null;
  }
  const rent = text.match(/^(?:please\s+)?(?:update|change|set|edit|modify|revise)\s+(.+?)\s+annual\s+rent\s+(?:to|at)\s+(.+)$/i);
  if (rent) {
    const amount = parseInrAmount(rent[2]);
    return amount !== null ? { kind: "update", propertyQuery: clean(rent[1]), changes: { annualRentInr: amount } } : null;
  }
  const ownership = text.match(/^(?:please\s+)?(?:update|change|set)\s+(.+?)\s+ownership\s+(?:percentage\s+)?(?:to|at)\s+(\d+(?:\.\d+)?)\s*%$/i);
  if (ownership) {
    const percent = Number(ownership[2]);
    return percent >= 0 && percent <= 100 ? { kind: "update", propertyQuery: clean(ownership[1]), changes: { ownershipPercent: percent } } : null;
  }
  const occupancy = text.match(/^(?:please\s+)?(?:update|change|set|mark)\s+(.+?)\s+(?:occupancy\s+status\s+to|as)\s+(tenanted|occupied|vacant|self[- ]occupied)$/i);
  if (occupancy) return { kind: "update", propertyQuery: clean(occupancy[1]), changes: { occupancyStatus: occupancy[2].replace("self occupied", "Self-occupied") } };
  return null;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

export async function executeFastAction(userId: string, message: string): Promise<FastActionResult | null> {
  const action = parsePortfolioAction(message);
  if (!action) return null;
  const propertyId = action.propertyQuery.match(/^(?:property\s+)?([a-z]\d{3,}|[a-z0-9]{20,})$/i)?.[1];
  if (propertyId) {
    const property = await updateProperty(userId, propertyId, action.changes);
    if (!property) return { toolName: "update_property", input: action, output: { error: "No property in this user's portfolio matches." }, answer: "No property was changed because that property is not in this user's portfolio." };
    const changed = action.changes.currentEstimatedValueInr !== undefined ? `Estimated value: ${formatMoney(property.currentEstimatedValueInr)}.` : action.changes.annualRentInr !== undefined ? `Annual rent: ${formatMoney(property.annualRentInr ?? 0)}.` : action.changes.ownershipPercent !== undefined ? `Ownership: ${property.ownershipPercent}%.` : `Occupancy: ${property.occupancyStatus}.`;
    return { toolName: "update_property", input: action, output: property, answer: `Updated ${property.location}. ${changed}` };
  }
  const matches = await findMatchingProperties(userId, action.propertyQuery);
  if (matches.length !== 1) {
    const output = { error: matches.length ? "Multiple properties match." : "No property in this user's portfolio matches.", matches: matches.map((property) => ({ id: property.id, location: property.location })) };
    return { toolName: "update_property", input: action, output, answer: matches.length ? `No property was changed because ${matches.length} properties matched. Please provide a more specific location or property description.` : "No property was changed because that property is not in this user's portfolio." };
  }
  const property = await updateProperty(userId, matches[0].id, action.changes);
  if (!property) return { toolName: "update_property", input: action, output: { error: "Property no longer exists." }, answer: "No property was changed because it could not be found." };
  const changed = action.changes.currentEstimatedValueInr !== undefined ? `Estimated value: ${formatMoney(property.currentEstimatedValueInr)}.` : action.changes.annualRentInr !== undefined ? `Annual rent: ${formatMoney(property.annualRentInr ?? 0)}.` : action.changes.ownershipPercent !== undefined ? `Ownership: ${property.ownershipPercent}%.` : `Occupancy: ${property.occupancyStatus}.`;
  return { toolName: "update_property", input: action, output: property, answer: `Updated ${property.location}. ${changed}` };
}
