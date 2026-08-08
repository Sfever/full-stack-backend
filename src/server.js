import "dotenv/config";

import cors from "cors";
import express from "express";

import pool, { verifyDatabaseConnection } from "./database.js";
import gameContext from "./game-context.js";
import userRouter from "./user-routes.js";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const frontendOrigins = (process.env.FRONTEND_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const frontendOrigin = frontendOrigins[0];
const model = process.env.OPENROUTER_MODEL ?? "openrouter/auto";
const maxMessageLength = 2_000;
const localDevelopmentOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
const systemInstructions = `
You are the Video Forge Studios website chatbot. Answer only from the supplied
game context. If the context does not contain the answer, say that the detail is
not available yet. Do not invent dates, prices, platforms, characters, features,
or links. Keep answers concise and friendly. Do not answer any other question.
`.trim();

app.disable("x-powered-by");
app.use(
  cors({
    origin(origin, callback) {
      const isAllowed =
        !origin ||
        frontendOrigins.includes(origin) ||
        (process.env.NODE_ENV !== "production" &&
          localDevelopmentOrigin.test(origin));

      callback(null, isAllowed);
    },
  }),
);
app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.use("/api/user", userRouter);

app.post("/api/chat", async (request, response) => {
  const message =
    typeof request.body?.message === "string" ? request.body.message.trim() : "";
  const history = Array.isArray(request.body?.history)
    ? request.body.history
        .filter(
          (item) =>
            (item?.role === "user" || item?.role === "assistant") &&
            typeof item.content === "string" &&
            item.content.trim(),
        )
        .slice(-10)
        .map((item) => ({
          role: item.role,
          content: item.content.trim().slice(0, maxMessageLength),
        }))
    : [];

  if (!message) {
    return response.status(400).json({ error: "message is required" });
  }

  if (message.length > maxMessageLength) {
    return response.status(400).json({
      error: `message must be ${maxMessageLength} characters or fewer`,
    });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return response.status(503).json({ error: "Chat service is not configured" });
  }

  try {
    const openRouterResponse = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.SITE_URL ?? frontendOrigin,
          "X-OpenRouter-Title": "Video Forge Studios",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemInstructions },
            { role: "system", content: `Game context:\n${gameContext}` },
            ...history,
            { role: "user", content: message },
          ],
          max_tokens: 300,
        }),
      },
    );

    const result = await openRouterResponse.json();
    if (!openRouterResponse.ok) {
      console.error("OpenRouter request failed:", result.error?.message);
      return response.status(502).json({ error: "Chat provider request failed" });
    }

    const answer = result.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      return response.status(502).json({ error: "Chat provider returned no answer" });
    }

    return response.json({ answer, model: result.model });
  } catch (error) {
    console.error("OpenRouter request failed:", error);
    return response.status(502).json({ error: "Chat provider request failed" });
  }
});

app.use((error, _request, response, _next) => {
  if (error instanceof SyntaxError && error.status === 400) {
    return response.status(400).json({ error: "Request body must be valid JSON" });
  }

  console.error("Request failed:", error);
  return response.status(500).json({ error: "Request failed" });
});

try {
  await verifyDatabaseConnection();
  console.log("Connected to PostgreSQL");

  app.listen(port, () => {
    console.log(`Chatbot backend listening on port ${port}`);
  });
} catch (error) {
  console.error("Failed to connect to PostgreSQL:", error);
  await pool.end();
  process.exitCode = 1;
}
