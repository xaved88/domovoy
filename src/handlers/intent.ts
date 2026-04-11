import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config';
import type { NotionClient } from '../notion';
import type { TelegramClient } from '../telegram';
import type { Person } from '../types';
import { TOOLS } from '../tools';

export function createIntentProcessor(
  config: Config,
  notion: NotionClient,
  telegram: TelegramClient,
) {
  const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

  async function processMessage(
    text: string,
    senderName: Person,
    chatId: number,
  ): Promise<void> {
    const chores = await notion.listChores();

    const choreList = chores
      .map(
        (c) =>
          `- id="${c.id}" name="${c.name}" assignee="${c.assignee ?? 'Shared'}"`,
      )
      .join('\n');

    const systemPrompt = `You are Domovoy, a household chore assistant for Logan and Yael.
Your only job is to parse messages and identify which chore has been completed.

Available chores:
${choreList}

Rules:
- If the message clearly refers to completing a chore, call log_chore with the matching chore_id and done_by set to the sender's name.
- If the message seems chore-related but you cannot confidently match a chore, call request_clarification with a short question.
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
      console.error('Intent processing: Claude did not return a tool call');
      return;
    }

    const { name, input } = toolUse;

    if (name === 'log_chore') {
      const { chore_id, done_by } = input as { chore_id: string; done_by: Person };
      const now = new Date();
      const errors: string[] = [];

      try {
        await notion.updateLastDone(chore_id, now);
      } catch (err) {
        console.error(`[log_chore] Failed to update Last Done: ${String(err)}`);
        errors.push('update Last Done');
      }

      try {
        await notion.createLogEntry(chore_id, done_by, now);
      } catch (err) {
        console.error(`[log_chore] Failed to create log entry: ${String(err)}`);
        errors.push('create log entry');
      }

      if (errors.length > 0) {
        await telegram.sendMessage(
          chatId,
          `⚠️ Chore noted but Notion update failed (${errors.join(', ')}). Please check manually.`,
        );
      } else {
        await telegram.sendMessage(chatId, '✅');
      }
    } else if (name === 'request_clarification') {
      const { message } = input as { message: string };
      await telegram.sendMessage(chatId, message);
    } else if (name === 'unrecognised') {
      console.log(`[unrecognised] "${text}" from ${senderName}`);
    } else {
      console.error(`Intent processing: unknown tool "${name}"`);
    }
  }

  return { processMessage };
}

export type IntentProcessor = ReturnType<typeof createIntentProcessor>;
