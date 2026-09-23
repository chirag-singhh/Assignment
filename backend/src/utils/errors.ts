import type { NextFunction, Request, Response } from "express";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
) {
  const status = error instanceof AppError ? error.status : 500;
  const message =
    error instanceof AppError
      ? error.message
      : "Something went wrong. Please try again.";
  if (status === 500) console.error(error);
  response.status(status).json({ error: message });
}
