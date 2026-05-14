import { matchChoreByName } from '../bot/fuzzy-router';
import { logChores } from './chore-log';
import { createLogger } from '../logger';
import type { CommandContext } from '../bot/command-registry';

const logger = createLogger('chore-done');

export async function choreDoneHandler(ctx: CommandContext): Promise<void> {
  const { args, senderName, chatId, messageId, notion, telegram } = ctx;

  if (!args) {
    await telegram.sendMessage(chatId, 'Usage: /chore-done <chore name>');
    return;
  }

  const chores = await notion.listChores();
  const match = matchChoreByName(args, chores);

  if (!match) {
    logger.info('chore-done: no confident chore match', { query: args, sender: senderName });
    await telegram.sendMessage(chatId, `I couldn't find a chore matching "${args}". Check the name and try again.`);
    return;
  }

  logger.info('chore-done: matched chore', { choreName: match.choreName, sender: senderName });
  await logChores([match.choreId], senderName, chatId, messageId, notion, telegram);
}
