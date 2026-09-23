# AI Real Estate Portfolio Analyst

A conversational analyst for the synthetic real estate portfolios supplied with the assignment. A user can ask about holdings, compare properties, add or update a property, and explore a hypothetical change. A separate business dashboard shows conversations and agent activity.

This guide starts with basic setup and then explains the code, data flow, calculations, API, testing, operations, and production considerations. **The steps below use PostgreSQL installed on your computer; Docker is not required.**

## Contents

1. [What the application does](#what-the-application-does)
2. [Concepts for beginners](#concepts-for-beginners)
3. [Architecture diagrams](#architecture-diagrams)
4. [Run it without Docker](#run-it-without-docker)
5. [Try the main features](#try-the-main-features)
6. [How a chat request works](#how-a-chat-request-works)
7. [Project files explained](#project-files-explained)
8. [Database and calculations](#database-and-calculations)
9. [API reference](#api-reference)
10. [Testing and performance](#testing-and-performance)
11. [Troubleshooting](#troubleshooting)
12. [Advanced design and limitations](#advanced-design-and-limitations)

## What the application does

- **Chat:** Select one of four synthetic users and ask questions in a WhatsApp-like interface. Conversations are saved and can be reopened.
- **Analysis:** Calculate portfolio value, annual rent, gross rental yield, property-type exposure, occupancy, and property comparisons from database records.
- **Actions:** Add a property or update one uniquely identified property when the user explicitly asks.
- **Scenarios:** Show what a portfolio would look like after excluding a property, without changing the database.
- **Business view:** Inspect users, conversations, messages, tool calls, timings, and conversations flagged for attention.

The application has three processes or services: the React frontend, the Express API, and PostgreSQL. The API also calls OpenRouter for language-model responses. The model interprets the user's request; TypeScript services perform the numerical calculations.

## Concepts for beginners

| Term | Meaning in this project |
| --- | --- |
| Frontend | The page in the browser, built with React and Vite. |
| Backend/API | The Express server that receives browser requests and returns JSON. |
| Agent | The LangChain loop that asks a model what tool to call and then prepares a reply. |
| Tool | A named, validated operation such as `search_properties` or `add_property`. |
| Service | Ordinary TypeScript code that reads data, writes data, or calculates results. |
| Prisma | The library that maps TypeScript database calls to PostgreSQL queries. |
| Migration | Versioned SQL that creates or changes database tables. |
| Seed | A script that imports the supplied CSV users and properties. |
| Conversation ID | An internal identifier that connects messages and tool logs across chat turns. |

## Architecture diagrams

### Components

```mermaid
flowchart LR
    U[User] --> UI[React chat]
    B[Business team] --> BI[React business dashboard]
    UI --> API[Express API]
    BI --> API
    API --> CHAT[Chat route]
    API --> ADMIN[Admin routes]
    CHAT --> AGENT[LangChain agent]
    AGENT <--> MODEL[OpenRouter model]
    AGENT --> TOOLS[Validated tools]
    TOOLS --> SERVICES[Portfolio and property services]
    SERVICES --> PRISMA[Prisma]
    ADMIN --> PRISMA
    CHAT --> PRISMA
    PRISMA <--> DB[(PostgreSQL)]
```

### One chat turn

```mermaid
sequenceDiagram
    actor User
    participant UI as React chat
    participant API as Express chat route
    participant DB as PostgreSQL
    participant Agent as LangChain agent
    participant Model as OpenRouter
    participant Tool as Portfolio tool
    User->>UI: Ask a question
    UI->>API: POST /api/chat
    API->>DB: Check user and save message
    API->>Agent: Run with recent conversation history
    Agent->>Model: Prompt and tool definitions
    Model-->>Agent: Tool call
    Agent->>Tool: Validated arguments
    Tool->>DB: Read or write scoped portfolio data
    Tool->>DB: Save tool log and duration
    Tool-->>Agent: Structured result
    Agent->>Model: Tool result
    Model-->>Agent: Final explanation
    Agent-->>API: Answer
    API->>DB: Save answer and update conversation
    API-->>UI: Answer and conversation ID
    UI-->>User: Display answer
```

### Database relationships

```mermaid
erDiagram
    User ||--o{ Property : owns
    User ||--o{ Conversation : starts
    Conversation ||--o{ Message : contains
    Conversation ||--o{ ToolLog : records
```

`User` has an ID, name, city, and preferences. `Property` stores type, location, area, value, rent, occupancy, ownership percentage, and status. `Conversation` belongs to one user. `Message` stores a user or assistant turn. `ToolLog` stores a tool name, input, output, timestamp, and elapsed milliseconds. See [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma) for the exact fields and indexes.

## Run it without Docker

### 1. Install prerequisites

- Node.js **20 or newer** and npm.
- PostgreSQL **15 or newer** installed and running locally. PostgreSQL 18 is supported.
- The password for your local PostgreSQL `postgres` user.
- An OpenRouter account, API key, and access/credits for the model selected in `.env`.

Docker is not used. On Windows, the PostgreSQL installer includes the server, `psql`, and pgAdmin. Keep the PostgreSQL Windows service running before starting the app.

### 2. Create the local database

The easiest setup is to install packages and run the secure setup command from the project root:

```powershell
npm install
npm run db:local:setup
```

The script asks for the local `postgres` password without displaying it, creates `portfolio_analyst`, updates only `DATABASE_URL` and `DIRECT_URL` in `.env`, applies the migrations, and loads the seed data. Skip to **Start the app** when it finishes.

To perform the same steps manually, open **SQL Shell (psql)** from the Start menu. Accept the defaults for server (`localhost`), database (`postgres`), port (`5432`), and username (`postgres`), then enter the password chosen during PostgreSQL installation. At the `postgres=#` prompt run:

```sql
CREATE DATABASE portfolio_analyst;
```

If PostgreSQL reports that the database already exists, continue. You only create it once. Exit with `\q`.

Both Prisma URLs point to this database. `DATABASE_URL` is used by the running API and `DIRECT_URL` is used by migrations.

### 3. Configure the environment

From the project root, copy `.env.example` to `.env` and edit `.env`. In PowerShell:

```powershell
Copy-Item .env.example .env
```

Set the values to your database and model account. Example **with placeholders**:

```dotenv
DATABASE_URL="postgresql://postgres:YOUR_LOCAL_POSTGRES_PASSWORD@127.0.0.1:5432/portfolio_analyst?schema=public"
DIRECT_URL="postgresql://postgres:YOUR_LOCAL_POSTGRES_PASSWORD@127.0.0.1:5432/portfolio_analyst?schema=public"
OPENROUTER_API_KEY=your-key-here
OPENROUTER_MODEL=nex-agi/nex-n2.5-mini:free
MODEL_TIMEOUT_MS=20000
MODEL_MAX_RETRIES=0
USER_PASSWORD=1234
ADMIN_PASSWORD=1234
PORT=5000
CORS_ORIGIN=http://localhost:5173
VITE_API_BASE_URL=http://localhost:5000
```

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Prisma/backend | Local PostgreSQL connection used by the Express API. |
| `DIRECT_URL` | Prisma Migrate | Local PostgreSQL connection used for schema migrations. |
| `OPENROUTER_API_KEY` | Backend only | Authenticates model requests. Keep it in `.env`, never in frontend code or `.env.example`. |
| `OPENROUTER_MODEL` | Backend only | Model name sent through OpenRouter. It must support tool calling. |
| `MODEL_TIMEOUT_MS` | Backend only | Maximum time for one model request; defaults to 20 seconds. |
| `MODEL_MAX_RETRIES` | Backend only | Provider retries; defaults to `0` to avoid doubling a slow request. Use `1` if reliability matters more than latency. |
| `USER_PASSWORD` | Backend only | Protects the Portfolio AI screen and user-facing APIs. The requested demo value is `1234`. |
| `ADMIN_PASSWORD` | Backend only | Protects the Business dashboard and every `/api/admin/*` data endpoint. The requested demo value is `1234`; use a strong secret for deployment. |
| `PORT` | Backend | API port; defaults to `5000`. |
| `CORS_ORIGIN` | Backend | Browser origin allowed to call the API. |
| `VITE_API_BASE_URL` | Frontend | URL of the API that the browser calls. |

`.env` is ignored by Git. If you have already created `.env`, **edit it rather than copying over it**. Do not paste API keys or database passwords into a Git commit, screenshot, issue, or chat message.

### 4. Install packages and prepare the database

Run these commands from the folder containing the root `package.json`:

```powershell
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
```

What each command does:

1. `npm install` installs the backend and frontend packages defined by the npm workspaces.
2. `db:generate` generates the Prisma Client from the schema. It does not create tables.
3. `db:migrate` runs the committed SQL migration through `DIRECT_URL` against `portfolio_analyst`.
4. `db:seed` imports the bundled CSVs from `dataset/`. It upserts seed rows by ID, so rerunning it does not duplicate them. It can reset changes to those original seed rows; use a fresh database for repeatable demos.

### 5. Start the app

```powershell
npm run dev
```

This starts the API (normally `http://localhost:5000`) and the Vite frontend (normally `http://localhost:5173`). Open the Vite URL printed in the terminal. Choose a user such as **U001 – Rahul Mehta**.

### Optional: switch this project to Supabase

The project includes a secure setup command for the configured Supabase project and shared pooler. It asks for the Supabase database password without displaying it, verifies authentication before changing `.env`, uses transaction mode on port `6543` for the API, uses session mode on port `5432` for migrations, applies the migration, and loads the dataset:

```powershell
npm run db:supabase:setup
```

Restart the backend after the command finishes. Run `npm run db:local:setup` whenever you want to switch back to locally installed PostgreSQL.

Check the API separately in PowerShell:

```powershell
Invoke-RestMethod http://localhost:5000/health
Invoke-RestMethod http://localhost:5000/api/users
```

The health endpoint only checks that the API process responds. Open the application and enter `1234` to access the Portfolio AI screen. The user selector then checks database access and should show the four seeded users. Open **Business** and enter `1234` again to access the operational dashboard.

## Try the main features

| User | Message | Expected path |
| --- | --- | --- |
| U001 | “What is my total portfolio value?” | Fast answer from fresh database records and calculation service. |
| U001 | “Show my retail properties.” | Fast answer listing current retail holdings. |
| U001 | “Which properties are above ₹10 crore?” | Property search with a value threshold. |
| U003 | “Which property gives me the highest annual rent?” | Fast answer from current owned annual rent. |
| U004 | “Add a 3000 sq ft retail property in Indiranagar worth ₹4.2 crore.” | Validated `add_property` write. |
| U001 | “Change my Bandra retail property value to ₹12.5 crore.” | Unique property match and validated `update_property` write. |
| U001 | “What if I exclude the Bandra property?” | Fast read-only scenario; actual records remain unchanged. |

For a multi-turn check, first ask U001 about retail properties, then ask “Which one is performing better?” The agent receives recent conversation history and can retrieve current property facts again. Open **Business** in the top navigation to inspect the resulting messages and tool calls.

## How a chat request works

1. [`frontend/src/main.tsx`](frontend/src/main.tsx) sends the selected `userId`, message, and optional `conversationId` to `POST /api/chat`.
2. [`backend/src/routes/chat.ts`](backend/src/routes/chat.ts) validates the user. For common, unambiguous read questions, [`fastAnswers.ts`](backend/src/agents/fastAnswers.ts) computes the answer from fresh property records. It saves both messages and a `portfolio_fast_answer` log in one database operation.
3. Other questions go to [`backend/src/agents/portfolioAgent.ts`](backend/src/agents/portfolioAgent.ts). It loads the latest 12 stored messages and a fresh, calculated portfolio snapshot. Its system prompt comes from [`prompts.ts`](backend/src/agents/prompts.ts).
4. Read-only questions use one OpenRouter model call with the snapshot. Write and scenario questions can call structured tools such as `add_property` or `run_portfolio_scenario`.
5. [`portfolioTools.ts`](backend/src/tools/portfolioTools.ts) validates tool arguments, calls a service, and saves a `ToolLog` with input, output, and duration. Every tool is scoped to the selected user.
6. The chat route saves the answer and returns it to the browser.

The model can make at most three passes. Each model call has a 30-second timeout and one retry for transient provider failures. If OpenRouter is still unavailable, the agent saves a `model_unavailable` log and returns a useful live portfolio snapshot instead of exposing an aborted request. The frontend renders assistant Markdown safely, so emphasis and lists appear as formatted content rather than visible formatting symbols.

### Actual data versus hypothetical data

The read tools and fast answers use current database records. [`scenarioService.ts`](backend/src/services/scenarioService.ts) filters an in-memory property list and returns **actual**, **hypothetical**, and **difference** values. It never writes to PostgreSQL. Fast scenario answers and the agent label those results as hypothetical.

### Tool access for every user

Every chat creates the same user-scoped tool set for U001, U002, U003, U004, and any future valid user:

| Capability | Implementation |
| --- | --- |
| Portfolio profile and summary | `get_portfolio` calls `getUserPortfolio` and `getUserProperties`. |
| Property lookup and filters | `search_properties` calls `getUserProperties`; update matching uses `findMatchingProperties`. |
| Add a property | `add_property` requires a complete record through `completeAgentPropertyInput`, verifies any explicitly stated type and INR value, and then calls `addProperty`. Missing details produce a clarification instead of a partial record. |
| Update a property | `update_property` calls `updateProperty` after `propertyChanges` validation. The database update includes both property ID and user ID. |
| Comparisons and scenarios | Comparison, highest-rent, and exclusion tools use only that user's current properties. |

Clear add and update sentences are parsed deterministically and sent directly through the same validated service functions. This removes one or two OpenRouter calls without bypassing validation, ownership checks, conversation history, or `ToolLog`. Less structured requests still use the model with the complete tool set.

## Project files explained

### Root folder

| File | Responsibility |
| --- | --- |
| `package.json` | npm workspace definitions and top-level commands for dev, build, test, migration, and seed. |
| `package-lock.json` | Locked dependency versions for repeatable installation. |
| `.env.example` | Safe template for configuration; leave secrets blank here. |
| `.gitignore` | Keeps `.env`, dependencies, generated builds, logs, and coverage out of Git. |
| `ARCHITECTURE.md` | Short system overview for the assignment. |
| `DECISION_LOG.md` | Engineering choices and trade-offs. |
| `SOUL.md` | Agent role, tone, skills, boundaries, and human handoff. |
| `PERFORMANCE.md` | Timing instrumentation and measurement method. |
| `WALKTHROUGH.md` | Outline for a 5–10 minute demonstration. |
| `docker-compose.yml` | Optional database convenience file for later; this guide does not use it. |

### Frontend

| File | Responsibility |
| --- | --- |
| `frontend/index.html` | HTML root where React mounts. |
| `frontend/src/main.tsx` | Chat view, user selection, conversation restore, message sending, business dashboard, and API requests. |
| `frontend/src/styles.css` | Layout, chat bubbles, dashboard tables, colors, and mobile styles. |
| `frontend/vite.config.ts` | Vite configuration with the React plugin. |
| `frontend/package.json` | React, Vite, and TypeScript dependencies and scripts. |
| `frontend/tsconfig*.json` | Frontend TypeScript build settings. |

### Backend

| File | Responsibility |
| --- | --- |
| `backend/src/server.ts` | Loads `.env`, configures CORS and JSON parsing, registers routes, and starts Express. |
| `backend/src/routes/chat.ts` | Chat request handling, conversation loading, message persistence, and agent error logging. |
| `backend/src/routes/properties.ts` | Direct property read/create/update/delete API endpoints. |
| `backend/src/routes/admin.ts` | User, conversation, tool-log, and attention-needed API endpoints. |
| `backend/src/agents/portfolioAgent.ts` | LangChain model setup, recent-message memory, tool-call loop, and model timing logs. |
| `backend/src/agents/prompts.ts` | Agent behavior rules, including missing-data honesty and write boundaries. |
| `backend/src/tools/portfolioTools.ts` | Tool names, descriptions, argument schemas, service calls, and tool logs. |
| `backend/src/services/propertyService.ts` | Prisma reads/writes, property field validation, decimal conversion, and property matching. |
| `backend/src/services/portfolioService.ts` | Deterministic value, rent, yield, exposure, occupancy, and comparison calculations. |
| `backend/src/services/scenarioService.ts` | Hypothetical exclusion without database mutation. |
| `backend/src/services/portfolioService.test.ts` | Calculation, scenario, occupancy, and supplied-data tests. |
| `backend/src/db/prisma.ts` | Shared Prisma Client instance. |
| `backend/src/middleware/validate.ts` | Zod request-body validation for API routes. |
| `backend/src/utils/errors.ts` | Safe HTTP error responses and server-side error logging. |
| `backend/src/types.ts` | TypeScript property shape used in calculations. |
| `backend/prisma/schema.prisma` | Models, relationships, field types, and indexes. |
| `backend/prisma.config.ts` | Loads the root `.env` for Prisma CLI commands run from `backend/`. |
| `backend/prisma/migrations/` | Committed SQL migration that creates the tables. |
| `backend/prisma/seed.ts` | Imports the CSV data into PostgreSQL. |

### Data and scripts

| File | Responsibility |
| --- | --- |
| `dataset/users.csv` | Four fictional users and their preferences. |
| `dataset/properties.csv` | Twelve initial properties across those users. |
| `dataset/sample_requests.csv` | Six example requests and their intended capabilities. |
| `dataset/DATASET.md`, `dataset/README.md` | Human-readable data and dataset notes. |
| `scripts/benchmark.mjs` | Sends three read-only chat requests and reports response times. |

## Database and calculations

### Import and ownership

Each property has one `userId`. Property tools read or update only records belonging to the selected user. Original CSV property IDs such as `P001` are kept; new property IDs are generated by Prisma. `purchasePriceInr` is blank in the seed, and there are no transaction dates, so the agent cannot calculate appreciation since purchase.

### Formulas

```text
owned value       = current estimated value × ownership percent / 100
owned annual rent = annual rent × ownership percent / 100
portfolio value   = sum of owned values
portfolio rent    = sum of owned annual rents
gross yield %     = portfolio rent / portfolio value × 100
```

For a zero-value portfolio, gross yield is `null` rather than an invented percentage. The code uses INR amounts; one crore equals 10,000,000 INR. For U001's supplied data, the initial portfolio value is ₹297,000,000, retail value is ₹212,000,000, and annual rent is ₹13,200,000. Tests check those numbers.

`Retail`, `Office`, and `Commercial Office` remain unchanged in stored data. The analysis groups known labels into `RESIDENTIAL` and `COMMERCIAL` and also reports retail and office values separately. Occupancy counts **Tenanted**, **Vacant**, and **Self-occupied** separately. A self-occupied property is not reported as vacant.

## API reference

All API responses are JSON except a successful delete. The UI calls these endpoints for you; direct calls are useful for learning and debugging.

| Method and path | Purpose |
| --- | --- |
| `GET /health` | Check that the API process responds. |
| `POST /api/chat` | Send a message; returns the answer and conversation ID. |
| `GET /api/chat/conversations?userId=U001` | List a user's 30 most recent conversations. |
| `GET /api/chat/conversations/:id?userId=U001` | Load one user's saved conversation. |
| `GET /api/properties?userId=U001` | List a user's properties. |
| `GET /api/properties/:id?userId=U001` | Get one property. |
| `POST /api/properties` | Create a property with `userId`, type, location, and estimated value. |
| `PATCH /api/properties/:id` | Update allowed fields using `{ "userId": "...", "changes": { ... } }`. |
| `DELETE /api/properties/:id?userId=U001` | Delete a property directly through the API. |
| `POST /api/auth/user-login` | Validate the Portfolio AI password. |
| `GET /api/users` | List the safe user fields needed by the portfolio selector; requires `x-user-password`. |
| `POST /api/admin/login` | Validate `{ "password": "..." }` before opening the Business dashboard. |
| `GET /api/admin/users` | List users and property/conversation counts. |
| `GET /api/admin/conversations` | List conversations and counts. |
| `GET /api/admin/conversations/:id` | Inspect messages and tool logs. |
| `GET /api/admin/tool-logs` | Get the 200 most recent tool logs. |
| `GET /api/admin/attention-needed` | Find conversations with an agent error or at least two recent tool errors. |

Example chat request in PowerShell:

```powershell
$body = @{ userId = 'U001'; message = 'What is my total portfolio value?' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:5000/api/chat' -Method Post -ContentType 'application/json' -Body $body
```

The response has a `conversationId`. Send that ID with the next message to keep context. For an add or update, the chat agent uses validated tools; the direct property API is primarily a development interface.

## Testing and performance

```powershell
npm run build
npm test
```

`build` type-checks both workspaces and bundles the frontend. `test` runs deterministic service tests, including calculations against the supplied U001 CSV rows. These tests do **not** prove that PostgreSQL or OpenRouter is currently reachable.

For an end-to-end check, first confirm that `GET /api/admin/users` returns four users. Then send one read-only chat request, verify the response, resume that conversation, and inspect its tool log in the business dashboard. Finally, test an explicit write in a disposable/demo database and confirm the changed property appears in a fresh read.

To measure live latency after the model and database work:

```powershell
node scripts/benchmark.mjs U001
```

The script reports each request time, median, and maximum. The API logs each model call and total chat request time as JSON. Each tool call stores `executionTimeMs` in PostgreSQL. See [`PERFORMANCE.md`](PERFORMANCE.md) for interpretation and scaling ideas.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `Can't reach database server` or Prisma initialization error | Start the local PostgreSQL Windows service and confirm it listens on `127.0.0.1:5432`. |
| `Authentication failed` | Replace `YOUR_LOCAL_POSTGRES_PASSWORD` in both URLs with the password chosen when PostgreSQL was installed. URL-encode reserved characters such as `@`, `:`, `/`, `?`, and `#`. |
| No users in the chat selector | Enter the Portfolio AI password, run `npm run db:migrate` and `npm run db:seed`, then check `GET /api/users` with the `x-user-password` header. |
| Portfolio screen says access is required | Enter the configured `USER_PASSWORD`. Protected user requests must include it in the `x-user-password` header. |
| Business dashboard says access is required | Enter the configured `ADMIN_PASSWORD`. Protected API requests must include it in the `x-admin-password` header. |
| Migration fails | Confirm `portfolio_analyst` exists and `DIRECT_URL` uses `127.0.0.1:5432`, user `postgres`, and the correct password. |
| `Prisma Client` missing | Run `npm install` and `npm run db:generate`. |
| Local PostgreSQL password is unknown | Reset it in pgAdmin or through your PostgreSQL administrator, then rerun `npm run db:local:setup`. The project does not contain or recover database passwords. |
| `db:generate` reports `EPERM` on `query_engine-windows.dll.node` | Stop the running backend on Windows, rerun `npm run db:generate`, then restart `npm run dev`; the running process may hold the engine file open. |
| Browser says `Failed to fetch` | Confirm the API is running on `PORT`, `VITE_API_BASE_URL` points to it, and `CORS_ORIGIN` matches the frontend origin. |
| `Unexpected token '<'` while parsing JSON | The browser reached an HTML page instead of the API. Redeploy the current build and check `VITE_API_BASE_URL`. The frontend now reports this as a configuration error rather than crashing. |
| `/api/auth/user-login` returns 404 on Render | Deploy the latest code, use one Render web service, and leave `VITE_API_BASE_URL` unset. The backend now serves both the frontend and `/api/*`; the browser also removes trailing slashes from configured API URLs. |
| OpenRouter returns HTTP 402 | The gateway declined the request for payment/credits. Check account balance, model access, and the configured model. |
| AI says it is not configured | Check that `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` are set in the root `.env`, then restart the backend. |
| Agent asks for clarification | Supply missing type, location, or value; or identify exactly one property. |
| Appreciation question cannot be answered | The seed has no purchase prices or dates. This is an intentional data limitation. |
| Port 5000 or 5173 is already in use | Stop the process using that port or change `PORT` and the matching frontend/API origin settings. |

## Advanced design and limitations

### Why use tools instead of model arithmetic?

The model is good at interpreting conversational language but can miscalculate or invent facts. Tools fetch current data and TypeScript functions calculate portfolio totals. This also makes the calculations testable without paying for model calls. Tool calls may add model round trips, so the agent limits history to 8 messages and has a two-pass cap.

### Observability and human review

`ToolLog` stores inputs, outputs, and time for each tool call. The business dashboard shows them next to messages. An agent failure or two recent tool errors flags a conversation. This is a simple review signal, not a full incident-management system.

### Security boundary

The assignment uses fictional users. Portfolio APIs require `USER_PASSWORD`, and the Business dashboard additionally requires `ADMIN_PASSWORD`. Both values are retained only in browser session storage and are cleared by **Lock** or when the browser session ends. This is suitable for the requested demo gate, but it is not full identity management because portfolio selection still uses a supplied user ID after the shared login. **Do not put real customer data in this demo or expose these APIs publicly as-is.** Before production use, replace shared passwords with authenticated accounts, server-issued secure sessions, role-based authorization on every endpoint, rate limits, audit retention rules, secret management, and restricted CORS.

### Render deployment

The repository contains `render.yaml`, so Render can create one Node web service that serves the API and the compiled React application.

1. Push the latest project files to the repository connected to Render.
2. In Render, use **New > Blueprint** and select that repository, or copy the commands below into an existing web service.
3. Set `DATABASE_URL` to the Supabase transaction pooler on port `6543` and include `?pgbouncer=true`.
4. Set `DIRECT_URL` to the Supabase session pooler on port `5432`.
5. Set `OPENROUTER_API_KEY`. Keep the configured model or choose another tool-capable OpenRouter model.
6. Leave `VITE_API_BASE_URL` unset. The frontend and API use the same Render origin.
7. Deploy and wait for `/health` to report `{"status":"ok"}`.

```text
Build command: npm ci && npm run build
Start command: npm run db:migrate && npm start
Health check: /health
```

After deployment, verify these URLs. Use exactly one slash between the hostname and `api`:

```text
https://assignment-pvzb.onrender.com/health
https://assignment-pvzb.onrender.com/api/auth/user-login
```

The login endpoint accepts `POST`, so opening it directly in a browser uses `GET` and is not a valid login test. The Portfolio screen sends the correct `POST` request. A Render free instance can sleep when idle, making the first request much slower; an always-on instance is required for consistent low latency.

### Higher-volume deployment

For a deployed system, use a persistent PostgreSQL service and connection pooling. This project can serve `frontend/dist` from the same Express service; if the frontend is hosted separately, set `VITE_API_BASE_URL` and allow its exact origin with `CORS_ORIGIN`. Run migrations before starting API instances. At larger scale, add pagination for admin lists, distributed per-user rate limits, request tracing, cost tracking, and caching with invalidation after writes. Measure p50, p95, and p99 latency before choosing optimizations.

The live URL, GitHub repository, and measured live response times are submission tasks beyond the local code. [`CHIRAG.md`](CHIRAG.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`DECISION_LOG.md`](DECISION_LOG.md), and [`SOUL.md`](SOUL.md) support the assignment walkthrough.
