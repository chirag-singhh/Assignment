# Decision log

| Decision | Reason and trade-off |
| --- | --- |
| One LangChain tool-calling agent through OpenRouter | Keeps orchestration understandable for a small dataset. Tool use can add model round trips; five passes cap runaway latency. |
| PostgreSQL and Prisma | Relational ownership, persisted conversations and auditable tool logs fit SQL. A local Docker database is another setup step, but matches a production deployment path. |
| Deterministic calculation services | Portfolio value, rent, yield and comparisons can be tested without an LLM. The model still interprets language and formats explanations. |
| Preserve raw type labels | The seed mixes Retail, Office and Commercial Office. Group known labels at analysis time, keeping original data intact. |
| Explicit write tools with validation | Property IDs are generated; users need not know internal IDs. Updates resolve exactly one owned property and accept only portfolio fields. |
| Last 12 messages as context | Enough for short follow-ups with bounded token use. Long conversations may lose old references; a summary or retrieval layer would help at scale. |
| In-memory scenarios | Keeps hypothetical analysis isolated from actual holdings. Only explicit add/update tools persist changes. |
| Simple attention rule | One agent error or two recent tool errors is easy to inspect. A larger system would use explicit review states and operational alerts. |

The synthetic demo has no identity system. Authentication, authorization and tighter CORS are required before using real customer data or making the admin API public.
