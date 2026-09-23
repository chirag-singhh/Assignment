import type { RequestHandler } from "express";
import { AppError } from "../utils/errors.js";

export function userPasswordIsValid(value: unknown) {
  return typeof value === "string" && value === (process.env.USER_PASSWORD ?? "1234");
}

export const requireUserPassword: RequestHandler = (request, _response, next) => {
  if (!userPasswordIsValid(request.header("x-user-password"))) {
    return next(new AppError(401, "Portfolio access password required."));
  }
  next();
};
