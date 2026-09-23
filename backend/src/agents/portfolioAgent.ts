import { ChatOpenAI } from "@langchain/openai";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { prisma } from "../db/prisma.js";
import { getUserProperties } from "../services/propertyService.js";
import {
  comparePropertyTypes,
  getPortfolioSummary,
  ownedRent,
  ownedValue,
} from "../services/portfolioService.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { fastAnswer } from "./fastAnswers.js";
import { executeFastAction } from "./fastActions.js";
import { createPortfolioTools } from "../tools/portfolioTools.js";

const MODEL_TIMEOUT_MS = 30000;

function providerFallback(properties: Awaited<ReturnType<typeof getUserProperties>>) {
  const summary = getPortfolioSummary(properties);
  const value = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(summary.totalValueInr);
  return `The AI reasoning service is temporarily unavailable, but your live data is connected. Your portfolio currently has ${summary.propertyCount} properties with ${value} in owned value. Please try the question again. Direct questions about value, properties, rent, occupancy, comparisons, risks, scenarios, and property updates continue to use the fast data path.`;
}

export function writeConfirmation(
  toolName: string,
  content: string,
): string | null {
  if (toolName !== "add_property" && toolName !== "update_property")
    return null;
  try {
    const result = JSON.parse(content) as Record<string, unknown>;
    if (typeof result.error === "string")
      return `The property was not saved: ${result.error}`;
    if (
      typeof result.location !== "string" ||
      typeof result.currentEstimatedValueInr !== "number"
    )
      return null;
    const value = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(result.currentEstimatedValueInr);
    return `${toolName === "add_property" ? "Added" : "Updated"} ${result.location} (${result.id}). Current estimated value: ${value}.${typeof result.annualRentInr === "number" ? ` Annual rent: ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(result.annualRentInr)}.` : ""}`;
  } catch {
    return null;
  }
}

export async function runPortfolioAgent(input: {
  userId: string;
  conversationId: string;
  message: string;
  profile: {
    name: string;
    city: string | null;
    statedPreferences: unknown;
    preferredLocations: unknown;
    portfolioValuePreference: string | null;
  };
}) {
  const actionStarted = Date.now();
  const action = await executeFastAction(input.userId, input.message);
  if (action) {
    await prisma.toolLog.create({
      data: {
        conversationId: input.conversationId,
        toolName: action.toolName,
        input: action.input as any,
        output: action.output as any,
        executionTimeMs: Date.now() - actionStarted,
      },
    });
    return action.answer;
  }
  const [history, properties] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId: input.conversationId },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    getUserProperties(input.userId),
  ]);
  const immediate = fastAnswer(input.message, properties);
  if (immediate) {
    await prisma.toolLog.create({
      data: {
        conversationId: input.conversationId,
        toolName: "portfolio_fast_answer",
        input: { intent: immediate.intent },
        output: { answer: immediate.answer },
        executionTimeMs: 0,
      },
    });
    return immediate.answer;
  }
  if (!process.env.OPENROUTER_API_KEY || !process.env.OPENROUTER_MODEL)
    return "AI is not configured. Set OPENROUTER_API_KEY and OPENROUTER_MODEL, then try again.";
  const snapshot = {
    userId: input.userId,
    profile: input.profile,
    summary: getPortfolioSummary(properties),
    typeComparison: comparePropertyTypes(properties),
    properties: properties.map((property) => ({
      id: property.id,
      location: property.location,
      propertyType: property.propertyType,
      subType: property.subType,
      areaSqft: property.areaSqft,
      currentEstimatedValueInr: property.currentEstimatedValueInr,
      purchasePriceInr: property.purchasePriceInr,
      annualRentInr: property.annualRentInr,
      ownershipPercent: property.ownershipPercent,
      ownedValueInr: ownedValue(property),
      ownedAnnualRentInr: ownedRent(property),
      grossYieldPercent: ownedValue(property)
        ? (ownedRent(property) / ownedValue(property)) * 100
        : null,
      occupancyStatus: property.occupancyStatus,
      tenantStatus: property.tenantStatus,
      status: property.status,
    })),
  };
  const tools = createPortfolioTools({
    userId: input.userId,
    conversationId: input.conversationId,
    userMessage: [input.message, ...history.filter((message: { role: string }) => message.role === "user").map((message: { content: string }) => message.content)].find((message) => /^\s*(?:please\s+)?(?:add|create|record|save)\b/i.test(message)) ?? input.message,
    log: async (toolName, toolInput, output, startedAt) => {
      await prisma.toolLog.create({
        data: {
          conversationId: input.conversationId,
          toolName,
          input: toolInput as any,
          output: output as any,
          executionTimeMs: Date.now() - startedAt,
        },
      });
    },
  });
  const toolByName = new Map(tools.map((tool) => [tool.name, tool]));
  const model = new ChatOpenAI({
    model: process.env.OPENROUTER_MODEL,
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    temperature: 0,
    timeout: MODEL_TIMEOUT_MS,
    maxRetries: 1,
    maxTokens: 600,
  });
  const needsTools =
    /\b(add|create|update|delete|remove|exclude|change|set|edit|modify|raise|increase|decrease|reduce|save|record|insert|revise)\b|\bwhat (?:if|happens if)\b|\bsuppose\b/i.test(
      input.message,
    );
  const explicitWrite =
    /\b(add|create|update|change|set|edit|modify|raise|increase|decrease|reduce|save|record|insert|revise)\b/i.test(
      input.message,
    ) &&
    !/^(what|how|why|when|where|which|if|suppose)\b|\bhow to\b|\bwhat information\b/i.test(
      input.message.trim(),
    );
  const responder = needsTools ? model.bindTools(tools) : model;
  const messages: any[] = [
    new SystemMessage(
      `${SYSTEM_PROMPT}\n\nFresh portfolio snapshot (INR): ${JSON.stringify(snapshot)}`,
    ),
    ...history
      .reverse()
      .map((message: { role: string; content: string }) =>
        message.role === "assistant"
          ? new AIMessage(message.content)
          : new HumanMessage(message.content),
      ),
  ];
  for (let pass = 0; pass < 3; pass += 1) {
    const llmStarted = Date.now();
    let answer: any;
    try {
      answer = await responder.invoke(messages, {
        signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown model error";
      console.warn(JSON.stringify({
        event: "model_unavailable",
        conversationId: input.conversationId,
        pass: pass + 1,
        latencyMs: Date.now() - llmStarted,
        error: errorMessage,
      }));
      await prisma.toolLog.create({
        data: {
          conversationId: input.conversationId,
          toolName: "model_unavailable",
          input: { pass: pass + 1 },
          output: { error: errorMessage },
          executionTimeMs: Date.now() - llmStarted,
        },
      });
      return providerFallback(properties);
    }
    console.info(
      JSON.stringify({
        event: "model_call",
        conversationId: input.conversationId,
        pass: pass + 1,
        latencyMs: Date.now() - llmStarted,
        toolCalls: answer.tool_calls?.length ?? 0,
      }),
    );
    messages.push(answer);
    if (!answer.tool_calls?.length) {
      if (explicitWrite)
        return "No property was changed. Please specify a property in your portfolio and the exact value or details to save.";
      return typeof answer.content === "string"
        ? answer.content
        : "I could not format a response.";
    }
    const writeConfirmations: string[] = [];
    for (const call of answer.tool_calls) {
      const tool = toolByName.get(call.name);
      const content = tool
        ? await (tool as any).invoke(call.args)
        : JSON.stringify({ error: `Unknown tool ${call.name}` });
      messages.push(new ToolMessage({ tool_call_id: call.id, content }));
      const confirmation = writeConfirmation(call.name, content);
      if (confirmation) writeConfirmations.push(confirmation);
    }
    if (writeConfirmations.length) return writeConfirmations.join("\n");
  }
  return "I could not complete that request after several tool calls. Please rephrase it.";
}
