# Domovoy — Claude Code Guide

## Project Overview

Household chore management for Logan and Yael. Chores live in Notion; a Telegram bot logs completions via natural language and sends daily reminders.

**Core flows:**
- User says "I did the dishes" → Claude identifies intent → Notion updated → bot replies with celebratory message
- Daily 9am reminder (Europe/Berlin) lists due/overdue chores grouped by person

Built for eventual multi-tenancy — integration points and config must support multiple households from the start.

## Architecture

```
src/
  bot/          # Telegram bot — message routing only, no business logic
  handlers/     # One file per capability: chore-log, reminder, clarification, etc.
  tools/        # Claude tool definitions registry
  notion/       # Typed Notion client wrapper
  telegram/     # Typed Telegram client wrapper
  scheduler/    # node-cron jobs
  config/       # Env var loading + zod validation, household config objects
  types/        # Shared TypeScript types
  index.ts
```

Bot receives a message → passes to Claude → Claude returns a tool call → dispatch layer routes to handler. Handlers own all business logic.

## Running Locally

```bash
yarn install
cp .env.example .env
docker compose up        # or: yarn dev
```

## Environment Variables

Loaded and zod-validated on startup — app exits if any var is missing or malformed.

| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | From BotFather |
| `TELEGRAM_CHAT_ID` | Numeric ID of the shared group chat |
| `TELEGRAM_LOGAN_USER_ID` | Logan's Telegram numeric user ID |
| `TELEGRAM_YAEL_USER_ID` | Yael's Telegram numeric user ID |
| `NOTION_API_KEY` | Notion integration token |
| `NOTION_CHORES_DB_ID` | ID of the Chores database |
| `NOTION_LOG_DB_ID` | ID of the Completion Log database |
| `ANTHROPIC_API_KEY` | Claude API key for intent processing |
| `TZ` | `Europe/Berlin` |

## Coding Conventions

- `strict: true` in tsconfig, no `any`
- async/await throughout, no `.then()` chains
- All integration calls wrapped in try/catch with context (e.g. `Error updating chore "dishes" in Notion: ...`)
- Typed wrappers for all Notion API responses

## Tooling

| | Command |
|---|---|
| Lint | `yarn lint` |
| Format | `yarn format` |
| Type check | `yarn tsc` |
| Test | `yarn test` |

Package manager: yarn. Linter: ESLint. Formatter: Prettier. Tests: Vitest.

## Architectural Principles

**Modular:** Each capability lives in `src/handlers/` as an isolated module invoked via the tool dispatch layer. Bot logic stays thin.

**Extensible:** Adding a feature = adding a tool definition in `src/tools/` + a handler in `src/handlers/`. Nothing else changes.

**Secrets isolated:** All credentials in env vars, accessed via the config module — never `process.env` directly, never in logs.

**Multi-tenancy ready:** User IDs and Notion DB IDs live in config objects (`household.users`, `household.notion`), not top-level constants. Handlers receive config as a parameter.

**Integration interfaces:** Notion and Telegram are only accessed through their typed wrappers in `src/notion/` and `src/telegram/`. Never call SDKs directly from business logic.

## Working Conventions

**Work directly on `main`.** Do not create feature branches or worktrees. Commit directly to main and push. Logan explicitly does not want branches being created and left unmerged.

## Message Routing Pipeline

Incoming non-system messages go through three tiers in order; the first match wins:

1. **Tier 1 — Telegram commands** (`/chore-done`, etc.): Registered in the command registry (`src/bot/command-registry.ts`). Executes immediately, no fuzzy matching or Claude call.
2. **Tier 2 — Fuzzy matching** (`src/bot/fuzzy-router.ts`): Pattern-matches natural language against known intent signatures ("did X", "finished X", …) and fuzzy-matches the extracted chore name against the Notion list. If confidence is high and the match is unambiguous, executes directly.
3. **Tier 3 — Claude** (`src/handlers/intent.ts`): Full NLU fallback for edge cases and multi-chore messages.

All three tiers call the same underlying handler functions in `src/handlers/` — no business logic lives in the routing layer.

## Adding a New Command

Every action the bot takes must have a Telegram slash command as its primary interface. Natural language and Claude are secondary paths that funnel into the same handler.

1. **Create a handler** in `src/handlers/<command-name>.ts` with signature `(ctx: CommandContext) => Promise<void>`.
2. **Register it** in `src/bot/index.ts`:
   ```ts
   registry.register('command-name', myHandler);
   ```
3. **Update fuzzy patterns** in `src/bot/fuzzy-router.ts` if natural language should also trigger this command.
4. **Add a Claude tool** in `src/tools/index.ts` if Claude should be able to invoke it as a fallback, and dispatch to the handler from `src/handlers/intent.ts`.

`/ping` and `/register` are system commands (no member lookup needed) and live as inline handlers in `src/bot/index.ts` — they do not go through the registry.
