import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { chatRouter } from "./routes/chat.js";
import { propertiesRouter } from "./routes/properties.js";
import { adminRouter } from "./routes/admin.js";
import { usersRouter } from "./routes/users.js";
import { authRouter } from "./routes/auth.js";
import { requireUserPassword } from "./middleware/userAuth.js";
import { errorHandler } from "./utils/errors.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const app = express();
const port = Number(process.env.PORT ?? 5000);

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json({ limit: "64kb" }));

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});
app.use("/api/auth", authRouter);
app.use("/api/chat", requireUserPassword, chatRouter);
app.use("/api/users", requireUserPassword, usersRouter);
app.use("/api/properties", requireUserPassword, propertiesRouter);
app.use("/api/admin", requireUserPassword, adminRouter);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Portfolio Analyst API listening on port ${port}`);
});
