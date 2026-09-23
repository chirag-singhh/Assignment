# Performance and observability

The API logs `chat_request` for end-to-end time and `model_call` for each OpenRouter call. Structured tools save their duration in `ToolLog`. Common read questions save a `portfolio_fast_answer` log. This makes provider delay visible separately from database work.

## Live measurement

Run `node scripts/benchmark.mjs U001` while the API, local PostgreSQL, and OpenRouter are configured. A September 23, 2026 remote-database run took **2,657 ms**, **2,609 ms**, and **1,686 ms** (median **2,609 ms**) for the three common questions. A run before the fast path failed after about 28 seconds on the original free model. These are historical observations, not a guaranteed latency target. Run the benchmark again after local setup to measure this computer.

The retail-versus-office comparison took about **43 seconds** through the original large free model and produced an incomplete reply. The same comparison now uses the calculation service and completed in about **5.6 seconds** in a live request. Earlier free-model tests took about **10.7** and **12.5 seconds**, and one tool-enabled request timed out. The production example now uses `openai/gpt-4.1-mini`, which supports tool calling. Provider latency can still vary.

## Request paths

- Common, unambiguous reads (portfolio value, retail list, highest rent, type comparison, and a single-property exclusion) use fresh database records and deterministic calculations. They avoid an OpenRouter round trip and persist the conversation in one nested write.
- Adds and updates are interpreted by the model and executed only through validated, user-scoped tools. Follow-up answers retain access to tools, so multi-turn property entry works.
- Other read questions receive the fresh portfolio snapshot in one model call without tool definitions. This avoids a second model call just to retrieve facts already loaded by the backend.
- Tool-driven writes and scenarios may need multiple model calls. Successful writes are confirmed directly from the saved database record, avoiding an extra formatting call. The agent has a configurable 20-second timeout, no automatic retry by default, and at most two passes. If the provider is unavailable during a write, it explicitly confirms that no property was changed.

Read results are not cached, so an API or chat write is reflected in the next read. Local PostgreSQL removes the wide-area database trip from each request. The main remaining latency for deterministic answers is conversation persistence; model-backed questions also depend on OpenRouter. Free OpenRouter providers may still be slow or rate-limited.
