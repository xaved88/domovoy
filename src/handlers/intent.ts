import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config';
import type { NotionClient } from '../notion';
import type { TelegramClient } from '../telegram';
import { TOOLS } from '../tools';
import { createLogger } from '../logger';

const logger = createLogger('intent');

const CELEBRATORY_EMOJIS = ['🎉', '👏', '🔥', '⚡'];
const COUNT_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

function countEmoji(n: number): string {
  return COUNT_EMOJIS[n - 1] ?? `×${n}`;
}

export function createIntentProcessor(
  config: Config,
  notion: NotionClient,
  telegram: TelegramClient,
) {
  const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

  async function processMessage(
    text: string,
    senderName: string,
    chatId: number,
    messageId: number,
  ): Promise<void> {
    logger.info('Processing message', { sender: senderName, text });
    const chores = await notion.listChores();

    const choreList = chores
      .map(
        (c) =>
          `- id="${c.id}" name="${c.name}" assignee="${c.assignee ?? 'Shared'}"`,
      )
      .join('\n');

    const systemPrompt = `You are Domovoy, a household chore assistant.
Your only job is to parse messages and identify which chores have been completed.

Available chores:
${choreList}

Rules:
- If the message refers to completing one or more chores, call log_chore with chore_ids containing ALL matching chore IDs, and done_by set to the sender's name. A single message may mention several chores — include every one.
- If the message seems chore-related but you cannot confidently match any chore, call request_clarification with a short question.
- If the message is clearly not about chores, call unrecognised.
- Always call exactly one tool.`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: systemPrompt,
      tools: TOOLS,
      tool_choice: { type: 'any' },
      messages: [{ role: 'user', content: `${senderName} says: ${text}` }],
    });

    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      logger.error('Claude did not return a tool call', { text, sender: senderName });
      return;
    }

    const { name, input } = toolUse;

    if (name === 'log_chore') {
      const { chore_ids, done_by } = input as { chore_ids: string[]; done_by: string };
      const now = new Date();
      logger.info('log_chore: starting', { count: chore_ids.length, doneBy: done_by, chore_ids });

      const failedIds = new Set<string>();

      for (const choreId of chore_ids) {
        let ok = true;

        try {
          await notion.updateLastDone(choreId, now);
        } catch (err) {
          logger.error('log_chore: failed to update Last Done', { choreId, error: String(err) });
          ok = false;
        }

        try {
          await notion.createLogEntry(choreId, done_by, now);
        } catch (err) {
          logger.error('log_chore: failed to create log entry', { choreId, doneBy: done_by, error: String(err) });
          ok = false;
        }

        if (ok) {
          logger.info('log_chore: chore logged', { choreId, doneBy: done_by });
        } else {
          failedIds.add(choreId);
        }
      }

      if (failedIds.size > 0) {
        logger.warn('log_chore: completed with errors', { failed: failedIds.size, total: chore_ids.length });
        await telegram.sendMessage(
          chatId,
          `⚠️ Chore noted but Notion update failed for ${failedIds.size} of ${chore_ids.length}. Please check manually.`,
        );
      } else {
        logger.info('log_chore: all chores logged successfully', { count: chore_ids.length, doneBy: done_by });
        const emoji = CELEBRATORY_EMOJIS[Math.floor(Math.random() * CELEBRATORY_EMOJIS.length)];
        await telegram.reactToMessage(chatId, messageId, emoji);
        if (chore_ids.length > 1) {
          await telegram.sendMessage(chatId, countEmoji(chore_ids.length));
        }
      }
    } else if (name === 'request_clarification') {
      const { message } = input as { message: string };
      await telegram.sendMessage(chatId, message);
    } else if (name === 'unrecognised') {
      logger.info('Unrecognised message', { text, sender: senderName });
    } else {
      logger.error('Unknown tool returned by Claude', { tool: name, text, sender: senderName });
    }
  }

  return { processMessage };
}

export type IntentProcessor = ReturnType<typeof createIntentProcessor>;
