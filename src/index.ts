import { loadConfig } from './config';
import { createNotionClient } from './notion';
import { createTelegramClient } from './telegram';
import { createBot } from './bot';
import { startScheduler } from './scheduler';

// Catch anything that slips through handler-level try/catch blocks
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

const config = loadConfig();
console.log(`Domovoy starting (tz: ${config.TZ})`);

const notion = createNotionClient(config);
const telegram = createTelegramClient(config);

startScheduler(notion, telegram, config);

const bot = createBot(config, notion, telegram);
bot.start();
