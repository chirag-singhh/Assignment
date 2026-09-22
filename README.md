# AI Real Estate Portfolio Analyst

A conversational analyst for the supplied synthetic real estate portfolios. The React chat lets a user ask questions, add or update a property, run a hypothetical exclusion and resume a conversation. A separate business dashboard shows users, conversations, messages, tool activity and conversations needing attention.

## Quick start

Requires Node.js 20+, Docker Desktop with its engine running, and an OpenRouter API key. The app uses PostgreSQL 16. No private property service is needed.

1. Copy `.env.example` to `.env` and set `OPENROUTER_API_KEY`. Change `OPENROUTER_MODEL` if desired. The supplied database URL matches the local Docker service.
2. Run `docker compose up -d db`.
3. Run `npm install`, `npm run db:generate`, `npm run db:migrate`, and `npm run db:seed` from this folder.
4. Run `npm run dev`. Open the Vite URL (normally `http://localhost:5173`). Pick one of the four seeded users.

The seed reads `dataset/users.csv` and `dataset/properties.csv` directly. It is safe to rerun: source rows are upserted by ID, while user-created properties remain intact. The migration is committed in `backend/prisma/migrations`.

## Try it

- U001: “Show me my retail properties.”
- U001: “Which of my properties are above ₹10 crore?”
- U003: “Which property gives me the highest annual rent?”
- U004: “Add a 3000 sq ft retail property in Indiranagar worth ₹4.2 crore.”
- U001: “Change my Bandra retail property value to ₹12.5 crore.”
- U001: “What if I exclude the Bandra property?” then “How would that change my portfolio?”

Ask for appreciation since purchase to see the missing-data boundary. Purchase prices and dates are absent in the seed and must not be invented.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run API and UI locally |
| `npm run build` | Compile both applications |
| `npm test` | Run deterministic analytics tests |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate` | Apply committed PostgreSQL migration |
| `npm run db:seed` | Import the bundled CSVs |
| `node scripts/benchmark.mjs U001` | Measure chat response time against a running app |

The API runs on port 5000. `/health` reports process health. `POST /api/chat` accepts `{ "userId": "U001", "message": "...", "conversationId": "optional" }`. The UI uses the other chat and admin endpoints. Tool logs and per-model-call timings are recorded for investigation.

## Design and documentation

- [Architecture](ARCHITECTURE.md): end-to-end diagram and data flow.
- [Decision log](DECISION_LOG.md): trade-offs and alternatives.
- [Agent definition](SOUL.md): voice, skills, write boundaries and handoff.
- [Performance](PERFORMANCE.md): timing instrumentation, measurement procedure and scaling path.
- [Walkthrough](WALKTHROUGH.md): a 5–10 minute demonstration outline.

## Deployment and boundaries

Deploy the API with Node 20+ and a persistent PostgreSQL database; run `npm run db:migrate` and `npm run db:seed` against that database. Build the frontend with `VITE_API_BASE_URL` set to the public API origin, and host `frontend/dist` on a static web host. Set `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` on the API host, and set `CORS_ORIGIN` to the frontend origin.

This assignment uses synthetic users selected by ID and has **no authentication**. Do not put real customer data in this demo or expose its admin endpoints publicly without adding identity, authorization and access logging. The app needs an OpenRouter key and a reachable PostgreSQL server to answer live AI requests. A deployed URL and GitHub repository must be supplied separately for submission.
