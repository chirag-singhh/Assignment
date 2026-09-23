import { describe, expect, it } from "vitest";
import { explicitAddFacts, explicitInrAmounts, parseInrAmount } from "./fastActions.js";

describe("fast portfolio actions", () => {
  it("parses Indian money units", () => {
    expect(parseInrAmount("₹4.2 crore")).toBe(42_000_000);
    expect(parseInrAmount("72 lakh")).toBe(7_200_000);
    expect(parseInrAmount("INR 12,500,000")).toBe(12_500_000);
  });

  it("extracts explicitly stated add facts for tool safety checks", () => {
    expect(explicitAddFacts("Add a Dahisar apartment at 18cr")).toEqual({ valueInr: 180_000_000, propertyType: "apartment" });
    expect(explicitAddFacts("Add a 3000 sq ft retail property in Indiranagar worth ₹4.2 crore")).toEqual({ valueInr: 42_000_000, propertyType: "retail" });
  });

  it("extracts explicit INR amounts without treating area or property labels as money", () => {
    expect(explicitInrAmounts("Update the Dahisar apartment value to 18cr")).toEqual([180_000_000]);
    expect(explicitInrAmounts("Update 1,800 sq ft at P007")).toEqual([]);
  });
});
