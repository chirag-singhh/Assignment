import type { RequestHandler } from "express";
import type { ZodSchema } from "zod";
import { AppError } from "../utils/errors.js";
export const validate = (schema: ZodSchema): RequestHandler => (request, _response, next) => { const result = schema.safeParse(request.body); if (!result.success) return next(new AppError(400, result.error.issues.map((i) => i.message).join("; "))); request.body = result.data; next(); };
