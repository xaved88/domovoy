import type { Config } from '../config';
import { createTelegramClient } from '../telegram';
import { createNotionClient } from '../notion';
import { createIntentProcessor } from '../handlers/intent';
import type { Person } from '../types';

const VALID_NAMES: Person[] = ['Logan', 'Yael'];

function ucFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function createBot(config: Config) {
  const telegram = createTelegramClient(config);
  const notion = createNotionClient(config);
  const intentProcessor = createIntentProcessor(config, notion, telegram);
  const groupChatId = Number(config.TELEGRAM_CHAT_ID);

  // /ping — health check, only responds in the group chat
  telegram.onCommand('ping', async (msg) => {
    if (msg.chat.id !== groupChatId) return;
    try {
      await telegram.sendMessage(groupChatId, 'pong');
    } catch (err) {
      console.error('Error handling /ping:', String(err));
    }
  });

  // /register <name> — maps sender's Telegram ID to a household member name
  telegram.onCommand('register', async (msg) => {
    if (msg.chat.id !== groupChatId) return;
    const telegramId = String(msg.from?.id);
    const raw = msg.text?.replace(/^\/register(?:@\w+)?\s*/i, '').trim() ?? '';
    const name = ucFirst(raw) as Person;

    if (!VALID_NAMES.includes(name)) {
      await telegram.sendMessage(
        groupChatId,
        `Unknown name "${raw}". Valid options: ${VALID_NAMES.join(', ')}.`,
      );
      return;
    }

    try {
      const taken = await notion.isMemberNameTaken(name);
      if (taken) {
        await telegram.sendMessage(groupChatId, `${name} is already registered.`);
        return;
      }
      await notion.registerMember(telegramId, name);
      await telegram.sendMessage(groupChatId, `You're registered as ${name} ✅`);
    } catch (err) {
      console.error('Error handling /register:', String(err));
    }
  });

  telegram.onMessage(async (msg) => {
    if (msg.chat.id !== groupChatId) return;
    if (!msg.text || msg.text.startsWith('/')) return;

    const telegramId = String(msg.from?.id);

    try {
      const senderName = await notion.lookupMember(telegramId);
      if (!senderName) return;
      await intentProcessor.processMessage(msg.text, senderName, groupChatId);
    } catch (err) {
      console.error('Error processing message:', String(err));
    }
  });

  function start(): void {
    telegram.startPolling();
    console.log('Telegram bot polling started');
  }

  return { start };
}
