import { matchChoreByName } from '../bot/fuzzy-router';
import type { NotionClient } from '../notion';
import type { TelegramClient } from '../telegram';
import type { CommandContext } from '../bot/command-registry';
import { createLogger } from '../logger';

const logger = createLogger('chore-skip');

const COUNT_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

function countEmoji(n: number): string {
  return COUNT_EMOJIS[n - 1] ?? `×${n}`;
}

export async function skipChores(
  choreIds: string[],
  chatId: number,
  messageId: number,
  notion: NotionClient,
  telegram: TelegramClient,
): Promise<void> {
  const now = new Date();
  logger.info('skipChores: starting', { count: choreIds.length, choreIds });

  const failedIds = new Set<string>();

  for (const choreId of choreIds) {
    let ok = true;

    try {
      await notion.updateLastDone(choreId, now);
    } catch (err) {
      logger.error('skipChores: failed to update Last Done', { choreId, error: String(err) });
      ok = false;
    }

    try {
      await notion.createSkipLogEntry(choreId, now);
    } catch (err) {
      logger.error('skipChores: failed to create skip log entry', { choreId, error: String(err) });
      ok = false;
    }

    if (ok) {
      logger.info('skipChores: chore skipped', { choreId });
    } else {
      failedIds.add(choreId);
    }
  }

  if (failedIds.size > 0) {
    logger.warn('skipChores: completed with errors', { failed: failedIds.size, total: choreIds.length });
    await telegram.sendMessage(
      chatId,
      `⚠️ Skip noted but Notion update failed for ${failedIds.size} of ${choreIds.length}. Please check manually.`,
    );
  } else {
    logger.info('skipChores: all chores skipped successfully', { count: choreIds.length });
    await telegram.reactToMessage(chatId, messageId, '🙈');
    if (choreIds.length > 1) {
      await telegram.sendMessage(chatId, countEmoji(choreIds.length));
    }
  }
}

export async function choreSkipHandler(ctx: CommandContext): Promise<void> {
  const { args, chatId, messageId, notion, telegram } = ctx;

  if (!args) {
    await telegram.sendMessage(chatId, 'Usage: /chore-skip <chore name>');
    return;
  }

  const chores = await notion.listChores();
  const match = matchChoreByName(args, chores);

  if (!match) {
    logger.info('chore-skip: no confident chore match', { query: args });
    await telegram.sendMessage(chatId, `I couldn't find a chore matching "${args}". Check the name and try again.`);
    return;
  }

  logger.info('chore-skip: matched chore', { choreName: match.choreName });
  await skipChores([match.choreId], chatId, messageId, notion, telegram);
}
