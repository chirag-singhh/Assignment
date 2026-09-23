import type { PortfolioProperty } from "../types.js";
import {
  calculateAnnualRent,
  calculateRentalYield,
  calculateTotalPortfolioValue,
  comparePropertyTypes,
  getHighestRentProperty,
  getOccupancyStats,
  getPortfolioSummary,
  ownedRent,
  ownedValue,
} from "../services/portfolioService.js";
import { excludePropertyScenario } from "../services/scenarioService.js";
import { parseInrAmount } from "./fastActions.js";

const money = (value: number) =>
  `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value)}`;
const crore = (value: number) => `${money(value / 10000000)} crore`;
const available = (value: string | number | null) =>
  value === null || value === "" ? "Not available" : String(value);

function completePortfolio(properties: PortfolioProperty[]) {
  if (!properties.length) return "Your portfolio does not contain any properties yet.";
  const summary = getPortfolioSummary(properties);
  const rows = properties.map((property, index) => {
    const ownership = property.ownershipPercent ?? 100;
    return [
      `### ${index + 1}. ${property.location}`,
      `- Type: ${property.propertyType}${property.subType ? ` — ${property.subType}` : ""}`,
      `- Area: ${property.areaSqft === null ? "Not available" : `${new Intl.NumberFormat("en-IN").format(property.areaSqft)} sq ft`}`,
      `- Current estimated value: ${money(property.currentEstimatedValueInr)}`,
      `- Purchase price: ${property.purchasePriceInr === null ? "Not available" : money(property.purchasePriceInr)}`,
      `- Annual rent: ${property.annualRentInr === null ? "Not available" : money(property.annualRentInr)}`,
      `- Ownership: ${ownership}%`,
      `- Owned value: ${money(ownedValue(property))}`,
      `- Occupancy: ${available(property.occupancyStatus)}`,
      `- Tenant status: ${available(property.tenantStatus)}`,
      `- Record status: ${available(property.status)}`,
    ].join("\n");
  });
  return [
    `## Complete portfolio`,
    `You have **${summary.propertyCount} properties** with **${crore(summary.totalValueInr)}** in owned value and **${money(summary.annualRentInr)}** in owned annual rent.`,
    ...rows,
  ].join("\n\n");
}

export function fastAnswer(
  message: string,
  properties: PortfolioProperty[],
): { intent: string; answer: string } | null {
  const question = message
    .trim()
    .toLowerCase()
    .replace(/[?.!]+$/, "");
  // Leave writes and mixed requests to the agent so no action is silently skipped.
  const isHypothetical = /\bwhat (?:if|happens if)\b|\bsuppose\b/.test(question);
  if (
    !isHypothetical &&
    /\b(add|create|update|change|edit|delete|remove|set|save)\b/.test(question)
  )
    return null;

  if (
    /^(?:what is|what's|tell me|show me|calculate|give me)?\s*(?:my|the)?\s*(?:total\s+)?portfolio\s+value$/.test(
      question,
    )
  ) {
    const value = calculateTotalPortfolioValue(properties);
    return {
      intent: "portfolio_value",
      answer: `Your total portfolio value is **${crore(value)}** (${money(value)}), based on your ownership shares.`,
    };
  }

  if (
    /^(?:(?:show|list|display|give)\s+(?:me\s+)?)?(?:my\s+)?(?:(?:complete|full|entire)\s+)?portfolio(?:\s+(?:details|holdings|properties))?$/.test(
      question,
    )
  ) {
    return { intent: "complete_portfolio", answer: completePortfolio(properties) };
  }

  if (/^(?:give me |show me |what is |what's )?(?:a )?(?:portfolio )?(?:summary|overview)$/.test(question)) {
    const summary = getPortfolioSummary(properties);
    const verb = (count: number) => count === 1 ? "is" : "are";
    return { intent: "portfolio_overview", answer: `You have ${summary.propertyCount} properties with ${crore(summary.totalValueInr)} in owned value, ${money(summary.annualRentInr)} in owned annual rent, and ${summary.rentalYieldPercent === null ? "no calculable" : `${summary.rentalYieldPercent.toFixed(2)}% gross`} rental yield. ${summary.occupancy.occupied} ${verb(summary.occupancy.occupied)} occupied or tenanted, ${summary.occupancy.vacant} ${verb(summary.occupancy.vacant)} vacant, and ${summary.occupancy.selfOccupied} ${verb(summary.occupancy.selfOccupied)} self-occupied.` };
  }

  if (/^(?:in one sentence,?\s*)?(?:tell me )?(?:how many properties i have|how many properties do i have)(?: and where they are located)?$/.test(question)) {
    return { intent: "property_count_locations", answer: `You have ${properties.length} properties: ${properties.map((property) => property.location).join("; ")}.` };
  }

  if (/\b(?:risk|risks|risky|concentration)\b/.test(question)) {
    const summary = getPortfolioSummary(properties);
    const cities = new Set(properties.map((property) => property.location.split(",").at(-1)?.trim()).filter(Boolean));
    const typeValues = Object.entries(summary.valueByType).sort((a, b) => b[1] - a[1]);
    const largestTypeShare = summary.totalValueInr && typeValues[0] ? (typeValues[0][1] / summary.totalValueInr) * 100 : 0;
    const risks: string[] = [];
    if (cities.size <= 1 && properties.length > 1) risks.push(`Geographic concentration: all properties are in ${[...cities][0] ?? "one market"}.`);
    if (largestTypeShare >= 70) risks.push(`Property-type concentration: ${typeValues[0][0].toLowerCase()} represents ${largestTypeShare.toFixed(1)}% of owned value.`);
    if (summary.occupancy.vacant) risks.push(`Vacancy exposure: ${summary.occupancy.vacant} of ${summary.propertyCount} properties are vacant.`);
    if (summary.highestValueProperty && summary.totalValueInr) risks.push(`Single-asset concentration: ${summary.highestValueProperty.location} is ${((ownedValue(summary.highestValueProperty) / summary.totalValueInr) * 100).toFixed(1)}% of owned value.`);
    return { intent: "portfolio_risks", answer: risks.length ? `Key portfolio risks:\n${risks.map((risk) => `- ${risk}`).join("\n")}` : "No major concentration or vacancy risk was detected from the available portfolio fields." };
  }

  if (
    /^(?:show|list)(?:\s+me)?\s+(?:my\s+)?retail\s+properties$/.test(question)
  ) {
    const retail = properties.filter(
      (property) => property.propertyType.trim().toLowerCase() === "retail",
    );
    const answer = retail.length
      ? `Your retail properties:\n${retail.map((property) => `- ${property.location}: ${crore(ownedValue(property))} owned value${property.annualRentInr === null ? "" : `, ${money(ownedRent(property))} owned annual rent`}`).join("\n")}`
      : "You have no retail properties in the current portfolio.";
    return { intent: "retail_properties", answer };
  }

  const propertyList = question.match(/^(?:show|list)(?:\s+me)?\s+(?:all\s+)?(?:my\s+)?(?:(residential|commercial|office)\s+)?properties$/);
  if (propertyList) {
    const requestedType = propertyList[1];
    const selected = properties.filter((property) => {
      if (!requestedType) return true;
      const type = property.propertyType.toLowerCase();
      return requestedType === "commercial" ? ["retail", "office", "commercial office", "commercial"].includes(type) : requestedType === "office" ? type.includes("office") : ["residential", "apartment", "villa"].includes(type);
    });
    const label = requestedType ? `${requestedType[0].toUpperCase()}${requestedType.slice(1)} properties` : "Properties";
    return { intent: "property_search", answer: selected.length ? `${label}:\n${selected.map((property) => `- ${property.location} — ${property.propertyType}, ${crore(ownedValue(property))} owned value`).join("\n")}` : `No ${requestedType ?? "matching"} properties were found in this portfolio.` };
  }

  const threshold = question.match(/^(?:show|list|which)(?:\s+me)?\s+(?:of\s+)?(?:my\s+)?properties\s+(?:are\s+)?(above|over|below|under)\s+(.+)$/);
  if (threshold) {
    const amount = parseInrAmount(threshold[2]);
    if (amount !== null) {
      const above = threshold[1] === "above" || threshold[1] === "over";
      const selected = properties.filter((property) => above ? ownedValue(property) > amount : ownedValue(property) < amount);
      return { intent: "property_value_search", answer: selected.length ? `${selected.map((property) => `- ${property.location} — ${crore(ownedValue(property))} owned value`).join("\n")}` : "No properties match that value threshold." };
    }
  }

  if (
    /^which property (?:gives me|has|earns) the highest annual rent$/.test(
      question,
    )
  ) {
    const property = getHighestRentProperty(properties);
    return {
      intent: "highest_rent",
      answer: property
        ? `${property.location} has the highest owned annual rent: **${money(ownedRent(property))}**.`
        : "You have no properties in the current portfolio.",
    };
  }

  if (
    /^(?:how many (?:of )?my properties are occupied|what is my occupancy rate)$/.test(
      question,
    )
  ) {
    const occupancy = getOccupancyStats(properties);
    return {
      intent: "occupancy",
      answer: `${occupancy.occupied} of your ${occupancy.total} properties are occupied or tenanted (${occupancy.occupancyRate.toFixed(1)}% occupancy). ${occupancy.vacant} are vacant and ${occupancy.selfOccupied} are self-occupied.`,
    };
  }

  if (
    /^compare (?:my )?retail and office properties(?: by value and rental yield)?$/.test(
      question,
    )
  ) {
    const rows = ["retail", "office"].map((type) => {
      const selected = properties.filter((property) =>
        type === "retail"
          ? property.propertyType.trim().toLowerCase() === "retail"
          : ["office", "commercial office"].includes(
              property.propertyType.trim().toLowerCase(),
            ),
      );
      const value = calculateTotalPortfolioValue(selected);
      const rent = calculateAnnualRent(selected);
      const yieldPercent = calculateRentalYield(selected);
      return `${type === "retail" ? "Retail" : "Office"} (${selected.length}): ${crore(value)} owned value, ${money(rent)} owned annual rent, ${yieldPercent === null ? "no rental yield" : `${yieldPercent.toFixed(2)}% gross rental yield`}`;
    });
    return { intent: "retail_office_comparison", answer: rows.join("\n") };
  }

  if (
    /^compare (?:my )?(?:residential and commercial|commercial and residential)(?: properties)?$/.test(
      question,
    )
  ) {
    const groups = comparePropertyTypes(properties);
    const rows = ["RESIDENTIAL", "COMMERCIAL"].map((type) => {
      const group = groups[type];
      return `${type === "RESIDENTIAL" ? "Residential" : "Commercial"} (${group.propertyCount}): ${crore(group.valueInr)} owned value, ${money(group.annualRentInr)} owned annual rent, ${group.rentalYieldPercent === null ? "no rental yield" : `${group.rentalYieldPercent.toFixed(2)}% gross rental yield`}`;
    });
    return { intent: "property_type_comparison", answer: rows.join("\n") };
  }

  const scenario = question.match(
    /\bwhat (?:if|happens if)\s+i\s+(?:exclude|remove)\s+(?:(?:the|my)\s+)?(.+?)(?:\s+property)?$/,
  );
  if (scenario) {
    const requested = scenario[1].trim();
    const topProperty = /^(?:top|highest(?:[- ]value)?|most valuable)$/.test(requested)
      ? getPortfolioSummary(properties).highestValueProperty
      : null;
    if (/^(?:top|highest(?:[- ]value)?|most valuable)$/.test(requested) && !topProperty) {
      return { intent: "exclude_scenario", answer: "Your portfolio does not contain a property to exclude." };
    }
    const result = excludePropertyScenario(properties, topProperty?.id ?? requested);
    if ("error" in result)
      return {
        intent: "exclude_scenario",
        answer: result.error ?? "The property could not be identified.",
      };
    return {
      intent: "exclude_scenario",
      answer: `**HYPOTHETICAL:** Excluding ${result.excludedProperty.location} would change your portfolio value from ${crore(result.actual.totalValueInr)} to **${crore(result.hypothetical.totalValueInr)}** (a decrease of ${crore(result.differenceInr)}). The database was not changed.`,
    };
  }

  return null;
}
