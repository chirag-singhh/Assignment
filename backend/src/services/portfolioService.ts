import type { PortfolioProperty } from "../types.js";

export type NormalizedType = "RESIDENTIAL" | "COMMERCIAL" | "OTHER";
const residential = new Set(["apartment", "villa", "residential"]);
const commercial = new Set([
  "retail",
  "high-street retail",
  "mall retail",
  "office",
  "commercial office",
  "commercial",
]);

export function normalizePropertyType(raw: string): NormalizedType {
  const value = raw.trim().toLowerCase();
  if (residential.has(value)) return "RESIDENTIAL";
  if (commercial.has(value)) return "COMMERCIAL";
  return "OTHER";
}

export function ownedValue(property: PortfolioProperty): number {
  return (
    property.currentEstimatedValueInr *
    ((property.ownershipPercent ?? 100) / 100)
  );
}
export function ownedRent(property: PortfolioProperty): number {
  return (
    (property.annualRentInr ?? 0) * ((property.ownershipPercent ?? 100) / 100)
  );
}
export function calculateTotalPortfolioValue(properties: PortfolioProperty[]) {
  return properties.reduce((sum, p) => sum + ownedValue(p), 0);
}
export function calculateAnnualRent(properties: PortfolioProperty[]) {
  return properties.reduce((sum, p) => sum + ownedRent(p), 0);
}
export function calculateRentalYield(properties: PortfolioProperty[]) {
  const value = calculateTotalPortfolioValue(properties);
  return value === 0 ? null : (calculateAnnualRent(properties) / value) * 100;
}
export function calculateValueByType(properties: PortfolioProperty[]) {
  return properties.reduce<Record<string, number>>((result, property) => {
    const type = normalizePropertyType(property.propertyType);
    result[type] = (result[type] ?? 0) + ownedValue(property);
    return result;
  }, {});
}
export function getHighestValueProperty(properties: PortfolioProperty[]) {
  return (
    [...properties].sort((a, b) => ownedValue(b) - ownedValue(a))[0] ?? null
  );
}
export function getLowestValueProperty(properties: PortfolioProperty[]) {
  return (
    [...properties].sort((a, b) => ownedValue(a) - ownedValue(b))[0] ?? null
  );
}
export function getHighestRentProperty(properties: PortfolioProperty[]) {
  return [...properties].sort((a, b) => ownedRent(b) - ownedRent(a))[0] ?? null;
}
export function getPropertiesByCity(
  properties: PortfolioProperty[],
  city: string,
) {
  return properties.filter((p) =>
    p.location.toLowerCase().includes(city.toLowerCase()),
  );
}
export function getOccupancyStats(properties: PortfolioProperty[]) {
  const occupied = properties.filter((p) =>
    ["tenanted", "occupied"].includes(p.occupancyStatus?.toLowerCase() ?? ""),
  ).length;
  const vacant = properties.filter((p) => p.occupancyStatus?.toLowerCase() === "vacant").length;
  const selfOccupied = properties.filter((p) => p.occupancyStatus?.toLowerCase() === "self-occupied").length;
  return {
    total: properties.length,
    occupied,
    vacant,
    selfOccupied,
    unknown: properties.length - occupied - vacant - selfOccupied,
    occupancyRate: properties.length ? (occupied / properties.length) * 100 : 0,
  };
}
export function comparePropertyTypes(properties: PortfolioProperty[]) {
  const groups = ["RESIDENTIAL", "COMMERCIAL"] as const;
  return Object.fromEntries(
    groups.map((group) => {
      const items = properties.filter(
        (p) => normalizePropertyType(p.propertyType) === group,
      );
      return [
        group,
        {
          propertyCount: items.length,
          valueInr: calculateTotalPortfolioValue(items),
          annualRentInr: calculateAnnualRent(items),
          rentalYieldPercent: calculateRentalYield(items),
        },
      ];
    }),
  );
}
export function getPortfolioSummary(properties: PortfolioProperty[]) {
  const retail = properties.filter((p) => p.propertyType.trim().toLowerCase() === "retail");
  const office = properties.filter((p) => ["office", "commercial office"].includes(p.propertyType.trim().toLowerCase()));
  return {
    propertyCount: properties.length,
    totalValueInr: calculateTotalPortfolioValue(properties),
    annualRentInr: calculateAnnualRent(properties),
    rentalYieldPercent: calculateRentalYield(properties),
    valueByType: calculateValueByType(properties),
    retailValueInr: calculateTotalPortfolioValue(retail),
    officeValueInr: calculateTotalPortfolioValue(office),
    highestValueProperty: getHighestValueProperty(properties),
    lowestValueProperty: getLowestValueProperty(properties),
    highestRentProperty: getHighestRentProperty(properties),
    occupancy: getOccupancyStats(properties),
  };
}
