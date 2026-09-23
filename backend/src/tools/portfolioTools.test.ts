import { expect, it } from "vitest";
import { createPortfolioTools } from "./portfolioTools.js";
import { completeAgentPropertyInput } from "../services/propertyService.js";

it("gives every user the complete tool set", () => {
  const expected = ["get_portfolio", "search_properties", "compare_property_types", "get_highest_rent_property", "add_property", "update_property", "run_portfolio_scenario"];
  for (const userId of ["U001", "U002", "U003", "U004"]) {
    const tools = createPortfolioTools({ userId, conversationId: `test-${userId}`, userMessage: "Show my portfolio", log: async () => undefined });
    expect(tools.map((tool) => tool.name)).toEqual(expected);
  }
});

it("requires a complete record before an agent can add a property", () => {
  expect(completeAgentPropertyInput.safeParse({ propertyType: "Apartment", location: "Dahisar", currentEstimatedValueInr: 180_000_000 }).success).toBe(false);
  expect(completeAgentPropertyInput.safeParse({
    propertyType: "Apartment",
    subType: null,
    location: "Dahisar",
    areaSqft: 1200,
    currentEstimatedValueInr: 180_000_000,
    purchasePriceInr: null,
    annualRentInr: null,
    occupancyStatus: "Self-occupied",
    tenantStatus: null,
    ownershipPercent: 100,
    status: "Active",
  }).success).toBe(true);
});
