# Domovoy — Claude Code Guide

## Project Overview

Domovoy is a household chore management system for Logan and Yael. Chores live in a Notion database. A Telegram bot handles logging completions via natural language and sends daily reminders.

**Core flows:**
- User says "I did the dishes" in a shared Telegram group → Claude identifies intent + chore → Notion is updated → bot replies with a celebratory message
- Daily 9am reminder (Europe/Berlin) lists chores that are due or overdue, grouped by person

The intent is eventually to offer this as a hosted service, so integration points and config must be structured for multi-tenancy from the start.

## Architecture

```
src/
  bot/          # Telegram bot setup and message routing (thin — no business logic)
  handlers/     # One file per capability: chore-log, reminder, clarification, etc.
  tools/        # Claude tool definitions (registry of all available tools)
  notion/       # Typed Notion client wrapper
  telegram/     # Typed Telegram client wrapper
  scheduler/    # node-cron jobs
  config/       # Env var loading, zod validation, household config objects
  types/        # Shared TypeScript types
  index.ts      # Entry point
```

**Key principle:** The bot layer receives a message and passes it to Claude. Claude returns a tool call. The tool dispatch layer routes to a handler. Handlers own all business logic. Bot logic stays thin.

## Running Locally

```bash
# Install dependencies
yarn install

# Copy env file and fill in values
cp .env.example .env

# Start (Docker)
docker compose up

# Start (without Docker, for development)
yarn dev
```

## Environment Variables

All config lives in `.env` (gitignored). `.env.example` is committed with placeholder values. Vars are loaded and validated with **zod** on startup — the app exits immediately if any required var is missing or malformed.

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

Never log secrets. Never hardcode them.

## Coding Conventions

- **TypeScript strict mode** — `strict: true` in tsconfig, no `any`
- **async/await throughout** — no `.then()` chains
- **Errors always caught and contextualized** — wrap integration calls in try/catch and include context in error messages (e.g. `Error updating chore "dishes" in Notion: <original message>`)
- **Typed Notion responses** — define types for all Notion API responses; never use raw `any` from the SDK
- **No secrets in code or logs** — read from config object only

## Tooling

- **Package manager:** yarn
- **Linting:** ESLint
- **Formatting:** Prettier
- **Tests:** Vitest
- **Lint command:** `yarn lint`
- **Type check:** `yarn tsc`
- **Test command:** `yarn test`
- **Format command:** `yarn format`

## Claude Code Hooks

Hooks are configured in `.claude/settings.json`. They run automatically:

- **Before a commit is made:** `yarn tsc --noEmit` (type check must pass)
- **After a file is saved:** `yarn lint --fix` (auto-fix lint issues)

These hooks are active once `node_modules` is installed (`yarn install`).

## Architectural Principles

Follow these in all code written for this project:

### MODULAR — Capabilities are isolated handlers
Each feature (chore logging, reminders, shopping list, etc.) lives in `src/handlers/` as an isolated module. It is invoked through the Claude tool dispatch layer. Bot logic does not contain business logic.

### EXTENSIBLE — Adding a feature = adding a tool + a handler
Claude tool definitions live in `src/tools/`. To add a capability: add a tool definition to the registry and a handler in `src/handlers/`. Nothing else changes.

### SECRETS ISOLATED
All credentials in env vars, validated with zod on startup. Never in code, never in logs. Config is accessed through the config module, not `process.env` directly outside of it.

### MULTI-TENANCY READY
User identities, Notion DB IDs, and household config are structured as config objects — not top-level constants. The current version serves one household; the structure should not prevent serving many. Concretely:
- Telegram user IDs live in a `household.users` config object, not as bare constants
- Notion DB IDs live in a `household.notion` config object
- Handlers receive config as a parameter rather than importing globals

### INTEGRATION INTERFACES
Notion and Telegram are accessed through typed client wrappers in `src/notion/` and `src/telegram/`. Business logic never calls the SDKs directly. This keeps integrations swappable and mockable.
