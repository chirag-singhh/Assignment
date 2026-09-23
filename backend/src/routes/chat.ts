import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { runPortfolioAgent } from "../agents/portfolioAgent.js";
import { fastAnswer } from "../agents/fastAnswers.js";
import { getUserProperties } from "../services/propertyService.js";
import { AppError } from "../utils/errors.js";
import { validate } from "../middleware/validate.js";
import { hidePropertyIds } from "../utils/assistantText.js";

export const chatRouter = Router();

async function persistImmediate(input: { userId: string; conversationId?: string; userMessage: string; answer: string; toolName: string; toolInput: unknown; toolOutput: unknown; startedAt: number }) {
  const data = {
    messages: { create: [{ role: "user", content: input.userMessage }, { role: "assistant", content: input.answer }] },
    toolLogs: { create: { toolName: input.toolName, input: input.toolInput as any, output: input.toolOutput as any, executionTimeMs: Date.now() - input.startedAt } },
    updatedAt: new Date(),
  };
  if (!input.conversationId) return prisma.conversation.create({ data: { userId: input.userId, ...data } });
  try {
    return await prisma.conversation.update({ where: { id: input.conversationId, userId: input.userId }, data });
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") throw new AppError(404, "Conversation not found for this user.");
    throw error;
  }
}

chatRouter.get("/conversations", async (req, res, next) => {
  try {
    const userId = String(req.query.userId ?? "");
    if (!userId) throw new AppError(400, "userId is required.");
    res.json(
      await prisma.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: 30,
        include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
      }),
    );
  } catch (error) {
    next(error);
  }
});

chatRouter.get("/conversations/:id", async (req, res, next) => {
  try {
    const userId = String(req.query.userId ?? "");
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, userId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!conversation) throw new AppError(404, "Conversation not found.");
    res.json(conversation);
  } catch (error) {
    next(error);
  }
});

chatRouter.post(
  "/",
  validate(
    z.object({
      userId: z.string().min(1),
      message: z.string().trim().min(1).max(4000),
      conversationId: z.string().optional(),
    }),
  ),
  async (req, res, next) => {
    const startedAt = Date.now();
    try {
      const fastCandidate =
        /portfolio value|portfolio (?:summary|overview|details|holdings|properties)|(?:complete|full|entire) portfolio|(?:show|list|display|give)(?: me)?(?: my)? portfolio|how many properties|where they are located|\b(?:risk|risks|risky|concentration)\b|(?:show|list|which).+properties|highest annual rent|occupancy rate|properties are occupied|what if i exclude|^compare /i.test(
          req.body.message,
        );
      const [user, requestedConversation, fastProperties] = await Promise.all([
        prisma.user.findUnique({ where: { id: req.body.userId } }),
        req.body.conversationId ? prisma.conversation.findFirst({ where: { id: req.body.conversationId, userId: req.body.userId } }) : Promise.resolve(null),
        fastCandidate
          ? getUserProperties(req.body.userId)
          : Promise.resolve(null),
      ]);
      if (!user) throw new AppError(404, "User not found.");
      if (req.body.conversationId && !requestedConversation) throw new AppError(404, "Conversation not found for this user.");
      if (fastProperties) {
        const immediate = fastAnswer(req.body.message, fastProperties);
        if (immediate) {
          const safeAnswer = hidePropertyIds(immediate.answer);
          const conversation = await persistImmediate({ userId: user.id, conversationId: req.body.conversationId, userMessage: req.body.message, answer: safeAnswer, toolName: "portfolio_fast_answer", toolInput: { intent: immediate.intent }, toolOutput: { answer: safeAnswer }, startedAt });
          console.info(
            JSON.stringify({
              event: "chat_request",
              conversationId: conversation.id,
              latencyMs: Date.now() - startedAt,
              path: "fast_answer",
            }),
          );
          res.json({
            conversationId: conversation.id,
            message: safeAnswer,
          });
          return;
        }
      }
      const conversation = req.body.conversationId
        ? requestedConversation
        : await prisma.conversation.create({ data: { userId: user.id } });
      if (!conversation)
        throw new AppError(404, "Conversation not found for this user.");
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "user",
          content: req.body.message,
        },
      });
      let answer: string;
      try {
        answer = await runPortfolioAgent({
          userId: user.id,
          conversationId: conversation.id,
          message: req.body.message,
          profile: {
            name: user.name,
            city: user.city,
            statedPreferences: user.statedPreferences,
            preferredLocations: user.preferredLocations,
            portfolioValuePreference: user.portfolioValuePreference,
          },
        });
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "agent_error",
            conversationId: conversation.id,
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        );
        answer = /abort|timeout|timed out/i.test(
          error instanceof Error ? error.message : "",
        )
          ? "The AI provider did not respond in time. Please retry your question."
          : "I could not complete that request. Please try again; the team can review this conversation.";
        await prisma.toolLog.create({
          data: {
            conversationId: conversation.id,
            toolName: "agent_error",
            input: {},
            output: {
              error: error instanceof Error ? error.message : "Unknown error",
            },
            executionTimeMs: Date.now() - startedAt,
          },
        });
      }
      answer = hidePropertyIds(answer);
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: answer,
        },
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });
      console.info(
        JSON.stringify({
          event: "chat_request",
          conversationId: conversation.id,
          latencyMs: Date.now() - startedAt,
        }),
      );
      res.json({ conversationId: conversation.id, message: answer });
    } catch (error) {
      next(error);
    }
  },
);
