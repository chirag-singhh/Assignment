import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { calculateAnnualRent, calculateRentalYield, calculateTotalPortfolioValue, calculateValueByType, getOccupancyStats, getPortfolioSummary } from "./portfolioService.js";
import { excludePropertyScenario } from "./scenarioService.js";
import type { PortfolioProperty } from "../types.js";
const properties: PortfolioProperty[] = [
  { id: "one", userId: "u", propertyType: "Apartment", subType: null, location: "Mumbai", areaSqft: null, currentEstimatedValueInr: 10_000_000, purchasePriceInr: null, annualRentInr: 500_000, occupancyStatus: "Occupied", tenantStatus: null, ownershipPercent: 100, status: null },
  { id: "two", userId: "u", propertyType: "Retail", subType: null, location: "Pune", areaSqft: null, currentEstimatedValueInr: 20_000_000, purchasePriceInr: null, annualRentInr: 1_000_000, occupancyStatus: "Vacant", tenantStatus: null, ownershipPercent: 50, status: null }
];
describe("portfolio calculations", () => {
  it("calculates owned value, rent, yield and type grouping", () => { expect(calculateTotalPortfolioValue(properties)).toBe(20_000_000); expect(calculateAnnualRent(properties)).toBe(1_000_000); expect(calculateRentalYield(properties)).toBe(5); expect(calculateValueByType(properties)).toEqual({ RESIDENTIAL: 10_000_000, COMMERCIAL: 10_000_000 }); });
  it("runs exclusions without mutating actual properties", () => { const result: any = excludePropertyScenario(properties, "Mumbai"); expect(result.hypothetical.totalValueInr).toBe(10_000_000); expect(result.databaseModified).toBe(false); expect(properties).toHaveLength(2); });
  it("uses dataset occupancy labels without treating self-occupied as vacant", () => {
    const actual = properties.map((p) => ({ ...p }));
    actual[0].occupancyStatus = "Tenanted";
    actual.push({ ...properties[0], id: "three", occupancyStatus: "Self-occupied", annualRentInr: 0 });
    expect(getOccupancyStats(actual)).toEqual({ total: 3, occupied: 1, vacant: 1, selfOccupied: 1, unknown: 0, occupancyRate: (1 / 3) * 100 });
  });
  it("reports retail and office exposure separately", () => {
    const summary = getPortfolioSummary([{ ...properties[1], ownershipPercent: 100 }, { ...properties[1], id: "office", propertyType: "Office", ownershipPercent: 100 }]);
    expect(summary.retailValueInr).toBe(20_000_000);
    expect(summary.officeValueInr).toBe(20_000_000);
  });
  it("matches the supplied U001 portfolio totals", () => {
    const csv = readFileSync(new URL("../../../dataset/properties.csv", import.meta.url), "utf8");
    const rows = parse(csv, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
    const actual: PortfolioProperty[] = rows.filter((r) => r.user_id === "U001").map((r) => ({
      id: r.property_id, userId: r.user_id, propertyType: r.property_type, subType: r.sub_type,
      location: r.location, areaSqft: Number(r.area_sqft), currentEstimatedValueInr: Number(r.current_estimated_value_inr),
      purchasePriceInr: null, annualRentInr: Number(r.annual_rent_inr), occupancyStatus: r.occupancy_status,
      tenantStatus: r.tenant_status, ownershipPercent: Number(r.ownership_percent), status: r.status,
    }));
    const summary = getPortfolioSummary(actual);
    expect(summary.totalValueInr).toBe(297_000_000);
    expect(summary.retailValueInr).toBe(212_000_000);
    expect(summary.annualRentInr).toBe(13_200_000);
    expect(summary.occupancy).toMatchObject({ occupied: 2, vacant: 1, selfOccupied: 0 });
  });
});
