import { describe, expect, it } from "vitest";
import { explicitAddFacts, incompleteAddPropertyAnswer, parseInrAmount, parsePortfolioAction } from "./fastActions.js";

describe("fast portfolio actions", () => {
  it("parses Indian money units", () => {
    expect(parseInrAmount("₹4.2 crore")).toBe(42_000_000);
    expect(parseInrAmount("72 lakh")).toBe(7_200_000);
    expect(parseInrAmount("INR 12,500,000")).toBe(12_500_000);
  });

  it("does not fast-save an add request before every detail is collected", () => {
    expect(parsePortfolioAction("Add a Dahisar apartment at 18cr")).toBeNull();
    expect(explicitAddFacts("Add a Dahisar apartment at 18cr")).toEqual({ valueInr: 180_000_000, propertyType: "apartment" });
    expect(explicitAddFacts("Add a 3000 sq ft retail property in Indiranagar worth ₹4.2 crore")).toEqual({ valueInr: 42_000_000, propertyType: "retail" });
    const answer = incompleteAddPropertyAnswer("Add a Dahisar apartment at 18cr");
    expect(answer).toContain("₹18,00,00,000");
    expect(answer).toContain("area in square feet");
    expect(answer).toContain("ownership percentage");
    expect(answer).toContain("No property has been added yet");
  });

  it("parses value, rent, ownership, and occupancy updates", () => {
    expect(parsePortfolioAction("Update property P007 estimated value to ₹24 crore.")).toMatchObject({ kind: "update", propertyQuery: "property P007", changes: { currentEstimatedValueInr: 240_000_000 } });
    expect(parsePortfolioAction("Set P007 annual rent to 18 lakh")).toMatchObject({ changes: { annualRentInr: 1_800_000 } });
    expect(parsePortfolioAction("Change P007 ownership percentage to 75%")).toMatchObject({ changes: { ownershipPercent: 75 } });
    expect(parsePortfolioAction("Mark P007 as vacant")).toMatchObject({ changes: { occupancyStatus: "vacant" } });
  });
});
