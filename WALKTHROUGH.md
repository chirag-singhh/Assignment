# 5–10 minute walkthrough

1. **Problem and architecture (1 minute):** Explain chat, agent, deterministic tools, PostgreSQL persistence and business view using `ARCHITECTURE.md`.
2. **Real portfolio analysis (2 minutes):** Select U001. Ask for total value, retail exposure and properties above ₹10 crore. Point to tool activity in the business view.
3. **Conversation and scenarios (1–2 minutes):** Ask about the Bandra property, then exclude it hypothetically. Show actual versus hypothetical figures and confirm the database did not change.
4. **Actions (1–2 minutes):** Add the sample U004 Indiranagar property, then update U001 Bandra value. Show the persisted record and refreshed analysis. Explain unique matching and missing-field clarification.
5. **Operations and trade-offs (1–2 minutes):** Inspect a conversation and tool log, explain attention flags, type normalization, missing purchase prices, latency instrumentation and the lack of authentication in this synthetic demo.

Before recording or submitting: run `npm run build`, `npm test`, the live benchmark, verify the deployed app URL and confirm the repository is accessible.
