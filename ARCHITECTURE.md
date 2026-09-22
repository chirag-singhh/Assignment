# Architecture

```text
React chat / business dashboard
             |
       Express API
       |       |
  chat route  admin read routes
       |
  LangChain tool-calling loop ---- OpenRouter model
       |
  validated portfolio tools
       |
  deterministic services
       |
  Prisma ---- PostgreSQL
       |
users, properties, conversations, messages, tool logs
```

The chat route validates the selected user and conversation, saves the user message, invokes the agent, saves its answer and updates the conversation timestamp. The agent receives the latest 12 messages. It can make up to five model passes and calls structured tools. Each tool is scoped to the selected user and records input, output and elapsed time. The API records model call and total request times as JSON logs.

Portfolio totals, annual rent and gross yield use ownership-adjusted values. Raw property types are retained; analytics group known residential and commercial labels while reporting retail and office separately. Tenanted, vacant and self-occupied are distinct states. Hypothetical exclusions operate on an in-memory list. Property writes validate allowed fields and require a unique match for updates.

The business UI reads users, conversations, messages and tool logs. An agent failure or two recent tool errors flags a conversation for attention. The UI is deliberately an observation interface, without CRM workflows.
