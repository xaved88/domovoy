import http from 'http';
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

notion.ensureSkippedColumn().catch((err) => {
  logger.error('Failed to ensure Skipped column in log DB', { error: String(err) });
});

startScheduler(notion, telegram, config);

const bot = createBot(config, notion, telegram);
bot.start();

// Minimal HTTP server so fly.io can health-check the machine and keep it running
http.createServer((_, res) => { res.writeHead(200); res.end('ok'); }).listen(8080);
