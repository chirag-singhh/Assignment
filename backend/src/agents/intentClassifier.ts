import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

const intents = [
  "portfolio_summary",
  "portfolio_value",
  "portfolio_breakdown",
  "property_search",
  "property_comparison",
  "rental_analysis",
  "occupancy_analysis",
  "scenario_analysis",
  "add_property",
  "update_property",
  "delete_property",
  "general_question",
  "clarification_needed",
  "unsupported",
] as const;

export const intentClassificationSchema = z.object({
  intent: z.enum(intents),
  confidence: z.number().min(0).max(1),
  entities: z.object({
    propertyReference: z.string().nullable(),
    location: z.string().nullable(),
    propertyType: z.string().nullable(),
    metric: z.string().nullable(),
    scenario: z.enum(["exclude_property", "none"]).nullable(),
  }),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string().nullable(),
});

export type IntentClassification = z.infer<typeof intentClassificationSchema>;

export type IntentClassifierInput = {
  message: string;
  recentMessages?: Array<{ role: "user" | "assistant"; content: string }>;
};

const CLASSIFIER_PROMPT = `You classify user requests for an AI real-estate portfolio analyst.
Return only the structured result requested by the schema.

Allowed intents:
- portfolio_summary: high-level overview of the portfolio
- portfolio_value: total value or value by a named group
- portfolio_breakdown: exposure, geography, property count, or holding breakdown
- property_search: list, find, or identify properties
- property_comparison: compare properties or property categories
- rental_analysis: rent, yield, or highest/lowest rent
- occupancy_analysis: occupied, vacant, tenant, or occupancy questions
- scenario_analysis: read-only hypotheticals such as excluding a property
- add_property, update_property, delete_property: explicit database actions
- general_question: relevant question that does not fit the above
- clarification_needed: cannot identify the requested property/action from the request and context
- unsupported: unrelated or unsafe request

Extract only entities explicitly stated or clearly implied by conversation context. Never invent an ID, location, value, or property. Set needsClarification when required action or property-identifying information is missing. A scenario is always read-only; it never authorizes a database mutation.`;

function configuredModel() {
  if (!process.env.OPENROUTER_API_KEY || !process.env.OPENROUTER_MODEL) {
    throw new Error("Intent classifier is not configured. Set OPENROUTER_API_KEY and OPENROUTER_MODEL.");
  }

  return new ChatOpenAI({
    model: process.env.OPENROUTER_MODEL,
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    temperature: 0,
    maxTokens: 250,
    timeout: 15_000,
    maxRetries: 0,
  }).withStructuredOutput(intentClassificationSchema, {
    name: "portfolio_intent_classification",
  });
}

/**
 * Classifies an ambiguous user request with an LLM. Call this after the
 * deterministic fast-answer path misses, then log the returned decision before
 * routing to a service or tool. It classifies only; it never reads or writes data.
 */
export async function classifyIntent(input: IntentClassifierInput): Promise<IntentClassification> {
  const context = input.recentMessages?.length
    ? `Recent conversation:\n${input.recentMessages.map((message) => `${message.role}: ${message.content}`).join("\n")}`
    : "No prior conversation.";
  const classifier = configuredModel();
  return classifier.invoke([
    new SystemMessage(CLASSIFIER_PROMPT),
    new HumanMessage(`${context}\n\nUser request: ${input.message}`),
  ]);
}
