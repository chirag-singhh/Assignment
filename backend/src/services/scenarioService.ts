import {
  calculateTotalPortfolioValue,
  getPortfolioSummary,
} from "./portfolioService.js";
import type { PortfolioProperty } from "../types.js";

export function excludePropertyScenario(
  properties: PortfolioProperty[],
  query: string,
) {
  const exactId = properties.find(
    (property) => property.id.toLowerCase() === query.trim().toLowerCase(),
  );
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word && !["property", "my", "the"].includes(word));
  const matches = exactId
    ? [exactId]
    : terms.length
    ? properties.filter((property) => {
        const haystack =
          `${property.id} ${property.location} ${property.propertyType} ${property.subType ?? ""}`.toLowerCase();
        return terms.every((word) => haystack.includes(word));
      })
    : [];
  if (matches.length !== 1)
    return {
      error: matches.length
        ? "More than one property matches. Provide a more specific location or description."
        : `No property matches \"${query}\".`,
      matches: matches.map((p) => ({ id: p.id, location: p.location })),
    };
  const hypotheticalProperties = properties.filter(
    (property) => property.id !== matches[0].id,
  );
  const actualValueInr = calculateTotalPortfolioValue(properties);
  const hypotheticalValueInr = calculateTotalPortfolioValue(
    hypotheticalProperties,
  );
  return {
    scenario: "exclude_property",
    databaseModified: false,
    excludedProperty: { id: matches[0].id, location: matches[0].location },
    actual: getPortfolioSummary(properties),
    hypothetical: getPortfolioSummary(hypotheticalProperties),
    differenceInr: actualValueInr - hypotheticalValueInr,
  };
}
