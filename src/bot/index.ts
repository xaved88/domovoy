import type { Config } from '../config';
import type { TelegramClient } from '../telegram';
import type { NotionClient } from '../notion';
import { createIntentProcessor } from '../handlers/intent';
import { createLogger } from '../logger';

const logger = createLogger('bot');

function ucFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function createBot(config: Config, notion: NotionClient, telegram: TelegramClient) {
  const intentProcessor = createIntentProcessor(config, notion, telegram);
  const groupChatId = Number(config.TELEGRAM_CHAT_ID);

  // /ping — health check, only responds in the group chat
  telegram.onCommand('ping', async (msg) => {
    if (msg.chat.id !== groupChatId) return;
    try {
      await telegram.sendMessage(groupChatId, 'pong');
    } catch (err) {
      logger.error('Error handling /ping', { error: String(err) });
    }
  });

  // /register <name> — maps sender's Telegram ID to a household member name
  telegram.onCommand('register', async (msg) => {
    if (msg.chat.id !== groupChatId) return;
    const telegramId = String(msg.from?.id);
    const raw = msg.text?.replace(/^\/register(?:@\w+)?\s*/i, '').trim() ?? '';

    if (!raw) {
      await telegram.sendMessage(groupChatId, 'Usage: /register <your name>');
      return;
    }

    const name = ucFirst(raw);

    try {
      const taken = await notion.isMemberNameTaken(name);
      if (taken) {
        await telegram.sendMessage(groupChatId, `${name} is already registered.`);
        return;
      }
      await notion.registerMember(telegramId, name);
      await notion.addChoreAssigneeOption(name);
      await telegram.sendMessage(groupChatId, `You're registered as ${name} ✅`);
    } catch (err) {
      logger.error('Error handling /register', { error: String(err) });
    }
  });

  telegram.onMessage(async (msg) => {
    if (msg.chat.id !== groupChatId) return;
    if (!msg.text || msg.text.startsWith('/')) return;

    const telegramId = String(msg.from?.id);
    logger.info('Message received', { from: telegramId, text: msg.text });

    try {
      const senderName = await notion.lookupMember(telegramId);
      if (!senderName) return;
      await intentProcessor.processMessage(msg.text, senderName, groupChatId, msg.message_id);
    } catch (err) {
      logger.error('Error processing message', { error: String(err) });
    }
  });

  function start(): void {
    telegram.startPolling();
    logger.info('Telegram bot polling started');
  }

  return { start };
}
