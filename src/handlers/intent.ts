import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config';
import type { NotionClient, Chore } from '../notion';
import type { TelegramClient } from '../telegram';
import { TOOLS } from '../tools';
import { logChores } from './chore-log';
import { skipChores } from './chore-skip';
import { createLogger } from '../logger';

const logger = createLogger('intent');

// Each clarification turn stores 3 entries: user msg + assistant tool_use + tool_result
const MAX_HISTORY_TURNS = 3;
const BONUS_KEYWORDS = /\b(bonus|star|medal|win)\b/i;
export function createIntentProcessor(
  config: Config,
  notion: NotionClient,
  telegram: TelegramClient,
) {
  const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  const histories = new Map<number, Anthropic.MessageParam[]>();

  function getHistory(chatId: number): Anthropic.MessageParam[] {
    return histories.get(chatId) ?? [];
  }

  function appendHistory(chatId: number, messages: Anthropic.MessageParam[]): void {
    const updated = [...getHistory(chatId), ...messages];
    histories.set(chatId, updated.slice(-(MAX_HISTORY_TURNS * 3)));
  }

  function clearHistory(chatId: number): void {
    histories.delete(chatId);
  }

  async function processMessage(
    text: string,
    senderName: string,
    chatId: number,
    messageId: number,
    preloadedChores?: Chore[],
  ): Promise<void> {
    logger.info('Processing message via Claude', { sender: senderName, text });

    if (BONUS_KEYWORDS.test(text)) {
      clearHistory(chatId);
      logger.info('Bonus keyword detected, logging ad-hoc win', { sender: senderName, text });
      try {
        await notion.createBonusLogEntry(text, senderName, new Date());
        await telegram.reactToMessage(chatId, messageId, '🏆');
      } catch (err) {
        logger.error('Failed to create bonus log entry', { error: String(err) });
        await telegram.sendMessage(chatId, '⚠️ Win noted but Notion update failed. Please check manually.');
      }
      return;
    }

    const [chores, memberNames] = await Promise.all([
      preloadedChores ? Promise.resolve(preloadedChores) : notion.listChores(),
      notion.listMemberNames(),
    ]);

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

Household members: ${memberNames.join(', ')}
Current sender: ${senderName}

Rules:
- If the message contains "skip" or "skipped" anywhere, call skip_chore with the matching chore_ids. Do not ask for confirmation.
- If the message refers to completing one or more chores, call log_chore with chore_ids containing ALL matching chore IDs. A single message may mention several chores — include every one.
- Set done_by to whoever actually completed the chore. If the message says another member did it (e.g. "Yael did the dishes"), set done_by to that member's name. Otherwise set done_by to the sender's name.
- Prefer a confident guess over asking. If you can identify the most plausible chore — even without certainty — call log_chore and pick it. A recoverable mistake is better than interrupting the user. Only call request_clarification if you face genuine 50/50 ambiguity between two specific chores with no signal to prefer one.
- If the message is clearly not about chores, call unrecognised.
- Always call exactly one tool.`;

    const userMessage: Anthropic.MessageParam = {
      role: 'user',
      content: `${senderName} says: ${text}`,
    };

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: systemPrompt,
      tools: TOOLS,
      tool_choice: { type: 'any' },
      messages: [...getHistory(chatId), userMessage],
    });

    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      logger.error('Claude did not return a tool call', { text, sender: senderName });
      return;
    }

    const { name, input } = toolUse;

    if (name === 'skip_chore') {
      clearHistory(chatId);
      const { chore_ids } = input as { chore_ids: string[] };
      await skipChores(chore_ids, chatId, messageId, notion, telegram);
    } else if (name === 'log_chore') {
      clearHistory(chatId);
      const { chore_ids, done_by } = input as { chore_ids: string[]; done_by: string };
      await logChores(chore_ids, done_by, chatId, messageId, notion, telegram);
      if (done_by !== senderName) {
        await telegram.sendMessage(chatId, `Logged for ${done_by}! 🎉`);
      }
    } else if (name === 'request_clarification') {
      const { message } = input as { message: string };
      appendHistory(chatId, [
        userMessage,
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: 'Sent to user.' }],
        },
      ]);
      await telegram.sendMessage(chatId, message);
    } else if (name === 'unrecognised') {
      clearHistory(chatId);
      logger.info('Unrecognised message', { text, sender: senderName });
    } else {
      logger.error('Unknown tool returned by Claude', { tool: name, text, sender: senderName });
    }
  }

  return { processMessage };
}

export type IntentProcessor = ReturnType<typeof createIntentProcessor>;
