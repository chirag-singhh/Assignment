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
import { createPortfolioTools } from "../tools/portfolioTools.js";

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

// Keep provider slowness bounded. Both values can be tuned in production
// without a code change, while conservative limits prevent minute-long waits.
const modelTimeoutMs = () => boundedInteger(process.env.MODEL_TIMEOUT_MS, 20000, 5000, 60000);
const modelMaxRetries = () => boundedInteger(process.env.MODEL_MAX_RETRIES, 0, 0, 2);

function providerFallback(properties: Awaited<ReturnType<typeof getUserProperties>>, writeRequested = false) {
  if (writeRequested)
    return "The AI service is temporarily unavailable, so no property was changed. Please retry when the service is available.";
  const summary = getPortfolioSummary(properties);
  const value = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(summary.totalValueInr);
  return `The AI reasoning service is temporarily unavailable, but your live data is connected. Your portfolio currently has ${summary.propertyCount} properties with ${value} in owned value. Please retry the question.`;
}

export function modelResponseText(content: unknown) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function writeConfirmation(
  toolName: string,
  content: string,
): string | null {
  if (toolName !== "add_property" && toolName !== "update_property")
    return null;
  try {
    const result = JSON.parse(content) as Record<string, unknown>;
    if (typeof result.error === "string") return null;
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
    return `${toolName === "add_property" ? "Added" : "Updated"} ${result.location}. Current estimated value: ${value}.${typeof result.annualRentInr === "number" ? ` Annual rent: ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(result.annualRentInr)}.` : ""}`;
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
  const [history, properties] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId: input.conversationId },
      orderBy: { createdAt: "desc" },
      take: 8,
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
    currentUserMessage: input.message,
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
  const timeoutMs = modelTimeoutMs();
  const model = new ChatOpenAI({
    model: process.env.OPENROUTER_MODEL,
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    temperature: 0,
    timeout: timeoutMs,
    maxRetries: modelMaxRetries(),
    maxTokens: 450,
  });
  const writeRequested =
    /\b(add|create|update|change|set|edit|modify|make|mark|raise|increase|decrease|reduce|save|record|insert|revise)\b/i.test(
      input.message,
    ) || history.slice(0, 4).some((message: { role: string; content: string }) =>
      message.role === "assistant" && /\b(?:before I add|missing|required fields?|please provide|more specific location|which property)\b/i.test(message.content),
    );
  // Tools stay available on every model turn. This is required for replies such
  // as "it is 1,800 sq ft..." after the agent asked for missing add details.
  const responder = model.bindTools(tools);
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
  let lastToolError = "";
  let mutationCompleted = false;
  for (let pass = 0; pass < 2; pass += 1) {
    const llmStarted = Date.now();
    let answer: any;
    try {
      answer = await responder.invoke(messages, {
        signal: AbortSignal.timeout(timeoutMs),
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
      return providerFallback(properties, writeRequested);
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
      const text = modelResponseText(answer.content);
      if (text) return text;
      console.warn(JSON.stringify({
        event: "empty_model_response",
        conversationId: input.conversationId,
        pass: pass + 1,
      }));
      return providerFallback(properties, writeRequested);
    }
    const writeConfirmations: string[] = [];
    for (const call of answer.tool_calls) {
      const toolStarted = Date.now();
      const tool = toolByName.get(call.name);
      const isMutation = call.name === "add_property" || call.name === "update_property";
      let content: string;
      if (isMutation && mutationCompleted) {
        content = JSON.stringify({ error: "Only one property mutation is allowed per message." });
      } else {
        try {
          content = tool
            ? await (tool as any).invoke(call.args)
            : JSON.stringify({ error: `Unknown tool ${call.name}` });
        } catch (error) {
          content = JSON.stringify({
            error: isMutation
              ? "The proposed property data failed validation. Ask the user for the missing or invalid fields."
              : error instanceof Error ? error.message : "Tool validation failed.",
          });
          await prisma.toolLog.create({
            data: {
              conversationId: input.conversationId,
              toolName: call.name || "unknown_tool",
              input: call.args as any,
              output: JSON.parse(content),
              executionTimeMs: Date.now() - toolStarted,
            },
          });
        }
      }
      messages.push(new ToolMessage({ tool_call_id: call.id, content }));
      try {
        const result = JSON.parse(content) as { error?: unknown };
        if (typeof result.error === "string") lastToolError = result.error;
        else if (isMutation) mutationCompleted = true;
      } catch {
        lastToolError = "The tool returned an invalid result.";
      }
      const confirmation = writeConfirmation(call.name, content);
      if (confirmation) writeConfirmations.push(confirmation);
    }
    if (writeConfirmations.length) return writeConfirmations.join("\n");
  }
  return lastToolError
    ? `No property was changed. ${lastToolError}`
    : "I could not complete that request after several tool calls. Please rephrase it.";
}
