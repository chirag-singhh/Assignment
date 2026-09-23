import { Router } from "express";
import { prisma } from "../db/prisma.js";

export const usersRouter = Router();

usersRouter.get("/", async (_request, response, next) => {
  try {
    response.json(
      await prisma.user.findMany({
        select: { id: true, name: true, city: true },
        orderBy: { id: "asc" },
      }),
    );
  } catch (error) {
    next(error);
  }
});
