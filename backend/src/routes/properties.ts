import { Router } from "express";
import { z } from "zod";
import {
  addProperty,
  deleteProperty,
  getPropertyById,
  getUserProperties,
  propertyChanges,
  propertyInput,
  updateProperty,
} from "../services/propertyService.js";
import { AppError } from "../utils/errors.js";
import { validate } from "../middleware/validate.js";

export const propertiesRouter = Router();
propertiesRouter.get("/", async (req, res, next) => {
  try {
    const userId = String(req.query.userId ?? "");
    if (!userId) throw new AppError(400, "userId is required.");
    res.json(await getUserProperties(userId));
  } catch (error) {
    next(error);
  }
});
propertiesRouter.get("/:id", async (req, res, next) => {
  try {
    const property = await getPropertyById(
      String(req.query.userId ?? ""),
      String(req.params.id),
    );
    if (!property) throw new AppError(404, "Property not found.");
    res.json(property);
  } catch (error) {
    next(error);
  }
});
propertiesRouter.post(
  "/",
  validate(propertyInput.extend({ userId: z.string().min(1) })),
  async (req, res, next) => {
    try {
      const { userId, ...input } = req.body;
      res.status(201).json(await addProperty(userId, input));
    } catch (error) {
      next(error);
    }
  },
);
propertiesRouter.patch(
  "/:id",
  validate(z.object({ userId: z.string().min(1), changes: propertyChanges })),
  async (req, res, next) => {
    try {
      const property = await updateProperty(
        req.body.userId,
        String(req.params.id),
        req.body.changes,
      );
      if (!property) throw new AppError(404, "Property not found.");
      res.json(property);
    } catch (error) {
      next(error);
    }
  },
);
propertiesRouter.delete("/:id", async (req, res, next) => {
  try {
    const userId = String(req.query.userId ?? "");
    if (!userId) throw new AppError(400, "userId is required.");
    if (!(await deleteProperty(userId, String(req.params.id))))
      throw new AppError(404, "Property not found.");
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
