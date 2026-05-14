import type { NotionClient } from '../notion';
import type { TelegramClient } from '../telegram';
import { createLogger } from '../logger';

const logger = createLogger('chore-log');

const CELEBRATORY_EMOJIS = ['🎉', '👏', '🔥', '⚡'];
const COUNT_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

function countEmoji(n: number): string {
  return COUNT_EMOJIS[n - 1] ?? `×${n}`;
}

export async function logChores(
  choreIds: string[],
  doneBy: string,
  chatId: number,
  messageId: number,
  notion: NotionClient,
  telegram: TelegramClient,
): Promise<void> {
  const now = new Date();
  logger.info('logChores: starting', { count: choreIds.length, doneBy, choreIds });

  const failedIds = new Set<string>();

  for (const choreId of choreIds) {
    let ok = true;

    try {
      await notion.updateLastDone(choreId, now);
    } catch (err) {
      logger.error('logChores: failed to update Last Done', { choreId, error: String(err) });
      ok = false;
    }

    try {
      await notion.createLogEntry(choreId, doneBy, now);
    } catch (err) {
      logger.error('logChores: failed to create log entry', { choreId, doneBy, error: String(err) });
      ok = false;
    }

    if (ok) {
      logger.info('logChores: chore logged', { choreId, doneBy });
    } else {
      failedIds.add(choreId);
    }
  }

  if (failedIds.size > 0) {
    logger.warn('logChores: completed with errors', { failed: failedIds.size, total: choreIds.length });
    await telegram.sendMessage(
      chatId,
      `⚠️ Chore noted but Notion update failed for ${failedIds.size} of ${choreIds.length}. Please check manually.`,
    );
  } else {
    logger.info('logChores: all chores logged successfully', { count: choreIds.length, doneBy });
    const emoji = CELEBRATORY_EMOJIS[Math.floor(Math.random() * CELEBRATORY_EMOJIS.length)];
    await telegram.reactToMessage(chatId, messageId, emoji);
    if (choreIds.length > 1) {
      await telegram.sendMessage(chatId, countEmoji(choreIds.length));
    }
  }
}
