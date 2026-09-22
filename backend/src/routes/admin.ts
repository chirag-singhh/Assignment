import { Router } from "express";
import { prisma } from "../db/prisma.js";
export const adminRouter = Router();
adminRouter.get("/users", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        _count: { select: { properties: true, conversations: true } },
      },
    });
    res.json(users);
  } catch (e) {
    next(e);
  }
});
adminRouter.get("/conversations", async (_req, res, next) => {
  try {
    const conversations = await prisma.conversation.findMany({
      include: {
        user: true,
        _count: { select: { messages: true, toolLogs: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    res.json(conversations);
  } catch (e) {
    next(e);
  }
});
adminRouter.get("/conversations/:id", async (req, res, next) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        user: true,
        messages: { orderBy: { createdAt: "asc" } },
        toolLogs: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!conversation)
      return res.status(404).json({ error: "Conversation not found." });
    res.json(conversation);
  } catch (e) {
    next(e);
  }
});
adminRouter.get("/tool-logs", async (_req, res, next) => {
  try {
    res.json(
      await prisma.toolLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    );
  } catch (e) {
    next(e);
  }
});
adminRouter.get("/attention-needed", async (_req, res, next) => {
  try {
    const conversations = await prisma.conversation.findMany({
      include: {
        user: true,
        toolLogs: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });
    res.json(
      conversations.filter(
        (c: { toolLogs: Array<{ output: unknown; toolName: string }> }) =>
          c.toolLogs.some((log) => log.toolName === "agent_error") ||
          c.toolLogs.filter((log: { output: unknown }) =>
            typeof log.output === "object" && log.output !== null && "error" in log.output,
          ).length >= 2,
      ),
    );
  } catch (e) {
    next(e);
  }
});
