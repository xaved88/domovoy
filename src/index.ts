import { loadConfig } from './config';
import { createBot } from './bot';

const config = loadConfig();
console.log(`Domovoy starting (tz: ${config.TZ})`);

const bot = createBot(config);
bot.start();
