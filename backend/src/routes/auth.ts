import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { userPasswordIsValid } from "../middleware/userAuth.js";
import { AppError } from "../utils/errors.js";

export const authRouter = Router();

authRouter.post(
  "/user-login",
  validate(z.object({ password: z.string().min(1).max(200) })),
  (request, response, next) => {
    if (!userPasswordIsValid(request.body.password)) {
      return next(new AppError(401, "Incorrect portfolio password."));
    }
    response.json({ authenticated: true });
  },
);
