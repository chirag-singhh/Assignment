import { ChatOpenAI } from "@langchain/openai";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { prisma } from "../db/prisma.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { createPortfolioTools } from "../tools/portfolioTools.js";

export async function runPortfolioAgent(input: {
  userId: string;
  conversationId: string;
  message: string;
}) {
  if (!process.env.OPENROUTER_API_KEY || !process.env.OPENROUTER_MODEL)
    return "AI is not configured. Set OPENROUTER_API_KEY and OPENROUTER_MODEL, then try again.";
  const history = await prisma.message.findMany({
    where: { conversationId: input.conversationId },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const tools = createPortfolioTools({
    userId: input.userId,
    conversationId: input.conversationId,
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
    timeout: 30000,
    maxRetries: 1,
  }).bindTools(tools);
  const messages: any[] = [
    new SystemMessage(SYSTEM_PROMPT),
    ...history
      .reverse()
      .map((message: { role: string; content: string }) =>
        message.role === "assistant"
          ? new AIMessage(message.content)
          : new HumanMessage(message.content),
      ),
  ];
  for (let pass = 0; pass < 5; pass += 1) {
    const llmStarted = Date.now();
    const answer: any = await model.invoke(messages);
    console.info(JSON.stringify({ event: "model_call", conversationId: input.conversationId, pass: pass + 1, latencyMs: Date.now() - llmStarted, toolCalls: answer.tool_calls?.length ?? 0 }));
    messages.push(answer);
    if (!answer.tool_calls?.length) {
      return typeof answer.content === "string"
        ? answer.content
        : "I could not format a response.";
    }
    for (const call of answer.tool_calls) {
      const tool = toolByName.get(call.name);
      const content = tool
        ? await (tool as any).invoke(call.args)
        : JSON.stringify({ error: `Unknown tool ${call.name}` });
      messages.push(new ToolMessage({ tool_call_id: call.id, content }));
    }
  }
  return "I could not complete that request after several tool calls. Please rephrase it.";
}
