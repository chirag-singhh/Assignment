import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import {
  addProperty,
  completeAgentPropertyInput,
  findMatchingProperties,
  getUserPortfolio,
  getUserProperties,
  propertyChanges,
  updateProperty,
} from "../services/propertyService.js";
import { explicitAddFacts, explicitInrAmounts } from "../agents/fastActions.js";
import {
  comparePropertyTypes,
  getHighestRentProperty,
  getPortfolioSummary,
  ownedRent,
  ownedValue,
} from "../services/portfolioService.js";
import { excludePropertyScenario } from "../services/scenarioService.js";

type Context = {
  userId: string;
  conversationId: string;
  userMessage: string;
  currentUserMessage: string;
  log: (
    name: string,
    input: unknown,
    output: unknown,
    startedAt: number,
  ) => Promise<void>;
};

function wrapped<T extends z.ZodRawShape>(
  context: Context,
  name: string,
  description: string,
  schema: z.ZodObject<T>,
  action: (input: z.infer<z.ZodObject<T>>) => Promise<unknown>,
) {
  return new DynamicStructuredTool({
    name,
    description,
    schema,
    func: async (input) => {
      const startedAt = Date.now();
      try {
        const output = await action(input);
        await context.log(name, input, output, startedAt);
        return JSON.stringify(output);
      } catch (error) {
        const output = {
          error: error instanceof Error ? error.message : "Tool failed",
        };
        await context.log(name, input, output, startedAt);
        return JSON.stringify(output);
      }
    },
  });
}

export function createPortfolioTools(context: Context) {
  return [
    wrapped(
      context,
      "get_portfolio",
      "Get the user's profile and actual portfolio summary, including value, rent, type exposure and occupancy.",
      z.object({}),
      async () => ({
        user: await getUserPortfolio(context.userId),
        summary: getPortfolioSummary(await getUserProperties(context.userId)),
      }),
    ),
    wrapped(
      context,
      "search_properties",
      "Search the user's actual properties and compare their owned value, annual rent and gross rental yield. Use for type, city, value threshold or identifying a property before an update.",
      z.object({
        propertyType: z.string().optional(),
        location: z.string().optional(),
        minValueInr: z.number().nonnegative().optional(),
        maxValueInr: z.number().nonnegative().optional(),
      }),
      async (filter) =>
        (await getUserProperties(context.userId))
          .filter(
            (p) =>
              (!filter.propertyType ||
                `${p.propertyType} ${p.subType ?? ""}`
                  .toLowerCase()
                  .includes(filter.propertyType.toLowerCase())) &&
              (!filter.location ||
                p.location
                  .toLowerCase()
                  .includes(filter.location.toLowerCase())) &&
              (filter.minValueInr === undefined ||
                p.currentEstimatedValueInr > filter.minValueInr) &&
              (filter.maxValueInr === undefined ||
                p.currentEstimatedValueInr < filter.maxValueInr),
          )
          .map((p) => ({
            ...p,
            ownedValueInr: ownedValue(p),
            ownedAnnualRentInr: ownedRent(p),
            grossYieldPercent: ownedValue(p)
              ? (ownedRent(p) / ownedValue(p)) * 100
              : null,
          })),
    ),
    wrapped(
      context,
      "compare_property_types",
      "Compare actual residential and commercial value, annual rent and gross yield.",
      z.object({}),
      async () => comparePropertyTypes(await getUserProperties(context.userId)),
    ),
    wrapped(
      context,
      "get_highest_rent_property",
      "Find the user's property with the highest annual rent.",
      z.object({}),
      async () =>
        getHighestRentProperty(await getUserProperties(context.userId)),
    ),
    wrapped(
      context,
      "add_property",
      "Create a property only after the user explicitly requests it and supplies every field: type, subtype or null, location, area in square feet, estimated value, purchase price or null, annual rent or null, occupancy, tenant status or null, ownership percentage, and record status. Preserve explicitly stated type and INR value exactly. Never invent missing details.",
      completeAgentPropertyInput,
      async (input) => {
        const stated = explicitAddFacts(context.userMessage);
        if (stated.valueInr !== null && input.currentEstimatedValueInr !== stated.valueInr) {
          return { error: `The stated value converts to INR ${stated.valueInr}, but the proposed value was INR ${input.currentEstimatedValueInr}. Do not save; use the stated value.` };
        }
        if (stated.propertyType && input.propertyType.trim().toLowerCase() !== stated.propertyType) {
          return { error: `The user stated property type ${stated.propertyType}, but the proposed type was ${input.propertyType}. Do not save; preserve the stated type.` };
        }
        return addProperty(context.userId, input);
      },
    ),
    wrapped(
      context,
      "update_property",
      "Update exactly one property after an explicit user request. Identify it with a unique location or description; ask when ambiguous. Internal IDs are allowed only for tool execution and must not be shown to the user.",
      z.object({ propertyQuery: z.string().min(1), changes: propertyChanges }),
      async ({ propertyQuery, changes }) => {
        const statedAmounts = explicitInrAmounts(context.currentUserMessage);
        const changedMoney = [
          changes.currentEstimatedValueInr,
          changes.purchasePriceInr,
          changes.annualRentInr,
        ].filter((value): value is number => typeof value === "number");
        if (statedAmounts.length === 1 && changedMoney.length === 1 && statedAmounts[0] !== changedMoney[0]) {
          return {
            error: `The user stated INR ${statedAmounts[0]}, but the proposed update was INR ${changedMoney[0]}. Do not save; use the stated amount.`,
          };
        }
        const matches = await findMatchingProperties(
          context.userId,
          propertyQuery,
        );
        if (matches.length !== 1)
          return {
            error: matches.length
              ? "Multiple properties match. Ask for a more specific property."
              : "No property matches.",
            matches: matches.map((p) => ({ id: p.id, location: p.location })),
          };
        return updateProperty(context.userId, matches[0].id, changes);
      },
    ),
    wrapped(
      context,
      "run_portfolio_scenario",
      "Run a read-only scenario excluding one property. This never modifies the database.",
      z.object({ excludeProperty: z.string().min(1) }),
      async ({ excludeProperty }) =>
        excludePropertyScenario(
          await getUserProperties(context.userId),
          excludeProperty,
        ),
    ),
  ];
}
