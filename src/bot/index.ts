import type { Config } from '../config';
import type { TelegramClient } from '../telegram';
import type { NotionClient } from '../notion';
import { createCommandRegistry } from './command-registry';
import type { CommandContext } from './command-registry';
import { fuzzyRoute } from './fuzzy-router';
import { logChores } from '../handlers/chore-log';
import { choreDoneHandler } from '../handlers/chore-done';
import { createIntentProcessor } from '../handlers/intent';
import { createLogger } from '../logger';

const logger = createLogger('bot');

function ucFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function createBot(config: Config, notion: NotionClient, telegram: TelegramClient) {
  const groupChatId = Number(config.TELEGRAM_CHAT_ID);
  const intentProcessor = createIntentProcessor(config, notion, telegram);

  // --- Command registry: all chore-action commands live here ---
  // To add a new command: register it here and create a handler in src/handlers/.
  const registry = createCommandRegistry();
  registry.register('chore-done', choreDoneHandler);

  for (const name of registry.names()) {
    telegram.onCommand(name, async (msg) => {
      if (msg.chat.id !== groupChatId) return;
      const telegramId = String(msg.from?.id);
      try {
        const senderName = await notion.lookupMember(telegramId);
        if (!senderName) return;
        const args = msg.text?.replace(new RegExp(`^\\/${name}(?:@\\w+)?\\s*`, 'i'), '').trim() ?? '';
        const ctx: CommandContext = { args, senderName, chatId: groupChatId, messageId: msg.message_id, notion, telegram, config };
        await registry.get(name)!(ctx);
      } catch (err) {
        logger.error(`Error handling /${name}`, { error: String(err) });
      }
    });
  }

  // --- Built-in system commands (no member lookup needed) ---

  // /ping — health check, responds in any chat
  telegram.onCommand('ping', async (msg) => {
    try {
      await telegram.sendMessage(msg.chat.id, 'pong');
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

  // --- Natural language messages: tier 2 (fuzzy) → tier 3 (Claude) ---
  telegram.onMessage(async (msg) => {
    if (msg.chat.id !== groupChatId) return;
    if (!msg.text || msg.text.startsWith('/')) return;

    const telegramId = String(msg.from?.id);
    logger.info('Message received', { from: telegramId, text: msg.text });

    try {
      const senderName = await notion.lookupMember(telegramId);
      if (!senderName) return;

      // Fetch chores once, shared across tier 2 and tier 3
      const chores = await notion.listChores();

      // Tier 2: fuzzy matching
      const fuzzyMatch = fuzzyRoute(msg.text, chores);
      if (fuzzyMatch) {
        logger.info('Fuzzy match: routing directly', { chore: fuzzyMatch.choreName, sender: senderName });
        await logChores([fuzzyMatch.choreId], senderName, groupChatId, msg.message_id, notion, telegram);
        return;
      }

      // Tier 3: Claude
      await intentProcessor.processMessage(msg.text, senderName, groupChatId, msg.message_id, chores);
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
