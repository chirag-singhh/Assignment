# Performance and observability

The API logs `model_call` for every OpenRouter round trip and `chat_request` for total request time, both with `conversationId` and milliseconds. Each structured tool persists its execution time and input/output in `ToolLog`. This separates model latency, database/tool work and remaining HTTP/orchestration time.

## Measure a live run

Start the database, seed it and run the app with a valid OpenRouter key. Then run `node scripts/benchmark.mjs U001`. The script sends three read-only questions in one conversation and reports every end-to-end time, median and maximum. Inspect API JSON logs with that conversation ID for model calls; inspect the business dashboard for tool times. Repeat the script several times to account for model and network variability. First calls may include connection warm-up.

**Measured typical latency:** pending a configured OpenRouter key and running PostgreSQL service in the target environment. This checkout has neither, so presenting a number as measured would be misleading. The benchmark is included so the final submission can record actual median and range before the walkthrough.

## Where time is spent and how it is controlled

The model gateway usually dominates because a tool answer needs a model call to choose a tool and another to phrase the result. Portfolio calculations are local and linear over this 12-property dataset. The agent uses a 12-message context window, one model for all requests, a 30-second model timeout, one retry and at most five passes. Indexed foreign keys support conversation and user property lookups. No vector store or extra routing call is used.

At much higher volume, use pooled database connections, request tracing, pagination in the business API, a queue for expensive background work, cached read-only summaries with invalidation after writes, model routing by task complexity, and per-user rate limits. Measure p50/p95/p99 latency and model cost by request before making those changes.
