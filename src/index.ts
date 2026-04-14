import { loadConfig } from './config';
import { createNotionClient } from './notion';
import { createTelegramClient } from './telegram';
import { createBot } from './bot';
import { startScheduler } from './scheduler';
import { createLogger } from './logger';

const logger = createLogger('app');

// Catch anything that slips through handler-level try/catch blocks
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: String(err) });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

const config = loadConfig();
logger.info('Domovoy starting', { tz: config.TZ });

const notion = createNotionClient(config);
const telegram = createTelegramClient(config);

startScheduler(notion, telegram, config);

const bot = createBot(config, notion, telegram);
bot.start();
