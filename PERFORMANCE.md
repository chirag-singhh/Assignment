# Performance and observability

The API logs `chat_request` for end-to-end time and `model_call` for each OpenRouter call. Structured tools save their duration in `ToolLog`. Common read questions save a `portfolio_fast_answer` log. This makes provider delay visible separately from database work.

## Live measurement

Run `node scripts/benchmark.mjs U001` while the API, local PostgreSQL, and OpenRouter are configured. A September 23, 2026 remote-database run took **2,657 ms**, **2,609 ms**, and **1,686 ms** (median **2,609 ms**) for the three common questions. A run before the fast path failed after about 28 seconds on the original free model. These are historical observations, not a guaranteed latency target. Run the benchmark again after local setup to measure this computer.

The retail-versus-office comparison took about **43 seconds** through the original large free model and produced an incomplete reply. The same comparison now uses the calculation service and completed in about **5.6 seconds** in a live request. The local configuration was changed to the smaller `nex-agi/nex-n2.5-mini:free` model; two open-ended read questions completed in about **10.7** and **12.5 seconds**. Free-provider latency still varies, and a later tool-enabled request timed out.

## Request paths

- Common, unambiguous reads (portfolio value, retail list, highest rent, type comparison, and a single-property exclusion) use fresh database records and deterministic calculations. They avoid an OpenRouter round trip and persist the conversation in one nested write.
- Clear adds and updates use deterministic intent parsing, `propertyInput` or `propertyChanges` validation, an atomic user-scoped database update, and one nested conversation/log write. They do not wait for OpenRouter.
- Other read questions receive the fresh portfolio snapshot in one model call without tool definitions. This avoids a second model call just to retrieve facts already loaded by the backend.
- Less structured writes and scenarios keep validated tools and may need multiple model calls. Simple successful writes are confirmed directly from the tool's saved database record, avoiding a second model call and a possible formatting error. The agent has a 30-second timeout per model call, one retry for transient provider failures, and at most three passes. If the provider remains unavailable, it returns a portfolio-aware fallback rather than an aborted response.

Read results are not cached, so an API or chat write is reflected in the next read. Local PostgreSQL removes the wide-area database trip from each request. The main remaining latency for deterministic answers is conversation persistence; model-backed questions also depend on OpenRouter. Free OpenRouter providers may still be slow or rate-limited.
