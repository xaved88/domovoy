# 🏠 Domovoy

Household chore manager for Logan and Yael. Chores live in Notion; a Telegram bot logs completions via natural language and sends a daily 9am reminder.

## Prerequisites

- Node.js 20+ (or Docker)
- A [Telegram](https://telegram.org/) account
- A [Notion](https://notion.so/) account with an integration token
- An [Anthropic](https://console.anthropic.com/) API key

## First-time setup

### 1. Create the Telegram bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts to choose a name and username
3. Copy the bot token — this is your `TELEGRAM_BOT_TOKEN`
4. Add the bot to your shared group chat
5. Send a message in the group, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` to find the `chat.id` — this is your `TELEGRAM_CHAT_ID`

To find your personal Telegram user ID, message [@userinfobot](https://t.me/userinfobot).

### 2. Create the Notion integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) and create a new integration
2. Copy the token — this is your `NOTION_API_KEY`
3. Share your Chores, Completion Log, and Members databases with the integration (open each database → ··· menu → Connections → add your integration)
4. Copy each database ID from its URL: `notion.so/<workspace>/<DATABASE_ID>?v=...`

### 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Where to get it |
|---|---|
| `TELEGRAM_BOT_TOKEN` | BotFather (step 1) |
| `TELEGRAM_CHAT_ID` | getUpdates (step 1) |
| `NOTION_API_KEY` | Notion integration (step 2) |
| `NOTION_CHORES_DB_ID` | Chores database URL |
| `NOTION_LOG_DB_ID` | Completion Log database URL |
| `NOTION_MEMBERS_DB_ID` | Members database URL |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) |
| `TZ` | Leave as `Europe/Berlin` |

### 4. Register household members

Start the bot, then in the group chat send:

```
/register Logan
/register Yael
```

Each person should send this from their own Telegram account so the bot can map their Telegram ID to their name.

## Running locally

**With Docker (recommended):**

```bash
docker compose up
```

**Without Docker:**

```bash
yarn install
yarn dev
```

## Adding chores

Open the Chores database in Notion and add rows directly. Each chore needs:

- **Name** — something natural, e.g. "dishes", "vacuuming", "take out the bins"
- **Assignee** — Logan / Yael / Shared
- **Frequency Days** — how often it should be done (1 = daily, 7 = weekly, 14 = fortnightly, 30 = monthly)
- **Frequency Label** — human-readable label (Daily, Weekly, etc.)
- **Last Done** — date it was last completed (leave blank if never done — it'll show as immediately due)

Chore names should be natural enough to match what you'd say in a message: "I did the laundry" → matches "laundry".

## Bot usage

**Logging a chore** — just say it naturally in the group:
> "I did the dishes"
> "just vacuumed"
> "took out the bins"

The bot reacts with an emoji to confirm. If it can't match the chore, it'll ask for clarification.

**Commands:**
- `/ping` — health check (bot replies "pong")
- `/register <name>` — register your Telegram ID (run once per person)

**Daily reminder** — at 9:00am Europe/Berlin the bot lists what's due or overdue, grouped by person.

## Cloud deployment (fly.io)

The bot uses long polling — no public URL or webhook needed. No flyctl install required — all fly.io operations run via Docker using `scripts/fly.ps1`.

### First-time setup

1. Create a free account at [fly.io](https://fly.io)

2. Authenticate (opens a browser tab):
   ```powershell
   .\scripts\fly.ps1 login
   ```

3. Create the app (once, to claim the name):
   ```powershell
   .\scripts\fly.ps1 setup
   ```
   If `domovoy` is taken, update the `app` field in `fly.toml` and the name in `scripts/fly.ps1`.

4. Push secrets from your `.env` file to fly.io:
   ```powershell
   .\scripts\fly.ps1 secrets
   ```
   Re-run this any time you add new environment variables.

5. Create a deploy token for CI/CD:
   ```powershell
   .\scripts\fly.ps1 token
   ```
   Copy the output, then go to your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `FLY_API_TOKEN`
   - Value: the token

6. Deploy:
   ```powershell
   .\scripts\fly.ps1 deploy
   ```

### Deploying manually

```powershell
.\scripts\fly.ps1 deploy
```

Or trigger from GitHub without touching the terminal: **Actions → CI/CD → Run workflow**.

### Automatic deploys

Every push to `main` runs tests and deploys automatically.

### Adding new environment variables

Add the variable to `.env`, then re-sync:
```powershell
.\scripts\fly.ps1 secrets
```

## Development

```bash
yarn lint       # ESLint
yarn format     # Prettier
yarn tsc        # TypeScript type check
yarn test       # Vitest
```
