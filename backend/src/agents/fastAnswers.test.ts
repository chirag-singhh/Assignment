import { expect, it } from "vitest";
import { fastAnswer } from "./fastAnswers.js";
import type { PortfolioProperty } from "../types.js";

const properties: PortfolioProperty[] = [
  {
    id: "a",
    userId: "u",
    propertyType: "Retail",
    subType: null,
    location: "Bandra, Mumbai",
    areaSqft: null,
    currentEstimatedValueInr: 20_000_000,
    purchasePriceInr: null,
    annualRentInr: 1_000_000,
    occupancyStatus: "Tenanted",
    tenantStatus: null,
    ownershipPercent: 50,
    status: null,
  },
  {
    id: "b",
    userId: "u",
    propertyType: "Office",
    subType: null,
    location: "Pune",
    areaSqft: null,
    currentEstimatedValueInr: 30_000_000,
    purchasePriceInr: null,
    annualRentInr: 2_000_000,
    occupancyStatus: "Vacant",
    tenantStatus: null,
    ownershipPercent: 100,
    status: null,
  },
];

it("answers common questions from owned values and handles punctuation", () => {
  expect(
    fastAnswer("What is my total portfolio value?", properties)?.answer,
  ).toContain("₹4 crore");
  expect(
    fastAnswer("Show my retail properties.", properties)?.answer,
  ).toContain("Bandra, Mumbai");
  expect(
    fastAnswer("What if I exclude the Bandra property?", properties)?.answer,
  ).toContain("₹3 crore");
  const topScenario = fastAnswer("hello tell me what if i remove my top property", properties)?.answer;
  expect(topScenario).toContain("Pune");
  expect(topScenario).toContain("₹1 crore");
  expect(topScenario).toContain("database was not changed");
  expect(
    fastAnswer(
      "Compare my retail and office properties by value and rental yield.",
      properties,
    )?.answer,
  ).toContain("Office (1): ₹3 crore");
  expect(
    fastAnswer("How many of my properties are occupied?", properties)?.answer,
  ).toContain("1 of your 2 properties");
  expect(
    fastAnswer("List my commercial properties", properties)?.answer,
  ).toContain("Bandra, Mumbai");
  expect(
    fastAnswer("Which of my properties are above ₹2 crore?", properties)?.answer,
  ).toContain("Pune");
  expect(fastAnswer("Give me a portfolio overview", properties)?.answer).toContain("2 properties");
  const complete = fastAnswer("show me my complete portfolio", properties)?.answer;
  expect(complete).toContain("Complete portfolio");
  expect(complete).toContain("Bandra, Mumbai");
  expect(complete).toContain("Pune");
  expect(complete).toContain("Area: Not available");
  expect(fastAnswer("How many properties do I have and where they are located?", properties)?.answer).toContain("Bandra, Mumbai");
  expect(fastAnswer("What risks do you see in my current portfolio?", properties)?.answer).toContain("Vacancy exposure");
});

it("leaves mixed write requests to the full agent", () => {
  expect(
    fastAnswer(
      "Change Bandra to 3 crore and show my retail properties",
      properties,
    ),
  ).toBeNull();
});
