import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { runPortfolioAgent } from "../agents/portfolioAgent.js";
import { AppError } from "../utils/errors.js";
import { validate } from "../middleware/validate.js";

export const chatRouter = Router();

chatRouter.get("/conversations", async (req, res, next) => {
  try {
    const userId = String(req.query.userId ?? "");
    if (!userId) throw new AppError(400, "userId is required.");
    res.json(await prisma.conversation.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 30, include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } }));
  } catch (error) { next(error); }
});

chatRouter.get("/conversations/:id", async (req, res, next) => {
  try {
    const userId = String(req.query.userId ?? "");
    const conversation = await prisma.conversation.findFirst({ where: { id: req.params.id, userId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
    if (!conversation) throw new AppError(404, "Conversation not found.");
    res.json(conversation);
  } catch (error) { next(error); }
});

chatRouter.post("/", validate(z.object({ userId: z.string().min(1), message: z.string().trim().min(1).max(4000), conversationId: z.string().optional() })), async (req, res, next) => {
  const startedAt = Date.now();
  try {
    const user = await prisma.user.findUnique({ where: { id: req.body.userId } });
    if (!user) throw new AppError(404, "User not found.");
    const conversation = req.body.conversationId
      ? await prisma.conversation.findFirst({ where: { id: req.body.conversationId, userId: user.id } })
      : await prisma.conversation.create({ data: { userId: user.id } });
    if (!conversation) throw new AppError(404, "Conversation not found for this user.");
    await prisma.message.create({ data: { conversationId: conversation.id, role: "user", content: req.body.message } });
    let answer: string;
    try {
      answer = await runPortfolioAgent({ userId: user.id, conversationId: conversation.id, message: req.body.message });
    } catch (error) {
      console.error(JSON.stringify({ event: "agent_error", conversationId: conversation.id, error: error instanceof Error ? error.message : "Unknown error" }));
      answer = "I could not complete that request. Please try again; the team can review this conversation.";
      await prisma.toolLog.create({ data: { conversationId: conversation.id, toolName: "agent_error", input: {}, output: { error: error instanceof Error ? error.message : "Unknown error" }, executionTimeMs: Date.now() - startedAt } });
    }
    await prisma.message.create({ data: { conversationId: conversation.id, role: "assistant", content: answer } });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    console.info(JSON.stringify({ event: "chat_request", conversationId: conversation.id, latencyMs: Date.now() - startedAt }));
    res.json({ conversationId: conversation.id, message: answer });
  } catch (error) { next(error); }
});
