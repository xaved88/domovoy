import { loadConfig } from './config';
import { createNotionClient } from './notion';
import { createTelegramClient } from './telegram';
import { createBot } from './bot';
import { startScheduler } from './scheduler';

const config = loadConfig();
console.log(`Domovoy starting (tz: ${config.TZ})`);

const notion = createNotionClient(config);
const telegram = createTelegramClient(config);

startScheduler(notion, telegram, config);

const bot = createBot(config, notion, telegram);
bot.start();
