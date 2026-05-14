import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config';
import type { NotionClient, Chore } from '../notion';
import type { TelegramClient } from '../telegram';
import { TOOLS } from '../tools';
import { logChores } from './chore-log';
import { createLogger } from '../logger';

const logger = createLogger('intent');

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
    preloadedChores?: Chore[],
  ): Promise<void> {
    logger.info('Processing message via Claude', { sender: senderName, text });
    const chores = preloadedChores ?? await notion.listChores();

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
      await logChores(chore_ids, done_by, chatId, messageId, notion, telegram);
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
