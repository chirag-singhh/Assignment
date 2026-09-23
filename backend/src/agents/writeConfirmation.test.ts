import { expect, it } from "vitest";
import { writeConfirmation } from "./portfolioAgent.js";

it("formats the saved INR value from the tool result", () => {
  const answer = writeConfirmation(
    "update_property",
    JSON.stringify({
      id: "P001",
      location: "Bandra West",
      currentEstimatedValueInr: 120_000_000,
      annualRentInr: 7_200_000,
    }),
  );
  expect(answer).toContain("₹12,00,00,000");
  expect(answer).not.toContain("12,000,000,000");
});
