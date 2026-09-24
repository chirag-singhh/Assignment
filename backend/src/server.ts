import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { chatRouter } from "./routes/chat.js";
import { propertiesRouter } from "./routes/properties.js";
import { adminRouter } from "./routes/admin.js";
import { usersRouter } from "./routes/users.js";
import { errorHandler } from "./utils/errors.js";
import { prisma } from "./db/prisma.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const app = express();
const port = Number(process.env.PORT ?? 5000);
const frontendDist = fileURLToPath(new URL("../../frontend/dist/", import.meta.url));
const frontendIndex = fileURLToPath(new URL("../../frontend/dist/index.html", import.meta.url));

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",").map((item) => item.trim()).filter(Boolean) ?? "http://localhost:5173" }));
app.use((_request, response, next) => {
  const startedAt = process.hrtime.bigint();
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "DENY");
  response.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    console.info(JSON.stringify({
      event: "http_request",
      method: _request.method,
      path: _request.originalUrl.split("?")[0],
      status: response.statusCode,
      latencyMs: Math.round(durationMs),
    }));
  });
  next();
});
app.use(express.json({ limit: "64kb" }));

app.get("/health", (_request, response) => {
  response.json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) });
});
app.use("/api/chat", chatRouter);
app.use("/api/users", usersRouter);
app.use("/api/properties", propertiesRouter);
app.use("/api/admin", adminRouter);
app.use("/api", (_request, response) => {
  response.status(404).json({ error: "API route not found." });
});
if (existsSync(frontendIndex)) {
  app.use(express.static(frontendDist, {
    index: false,
    setHeaders: (response, assetPath) => {
      response.setHeader("Cache-Control", assetPath.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
    },
  }));
  app.use((request, response, next) => {
    if (request.method === "GET" && request.accepts("html")) return response.sendFile(frontendIndex);
    next();
  });
}
app.use(errorHandler);

// Open the database connection before accepting traffic. This removes the lazy
// connection delay from the first user request and makes bad deployment
// credentials fail during startup instead of in the middle of a chat.
await prisma.$connect();

const server = app.listen(port, () => {
  console.log(`Portfolio Analyst API listening on port ${port}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received; closing the API.`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
