import TelegramBot from 'node-telegram-bot-api';
import { Config } from '../config';

export interface TelegramClient {
  sendMessage: (chatId: number | string, text: string, parseMode?: 'Markdown' | 'HTML') => Promise<void>;
  reactToMessage: (chatId: number, messageId: number, emoji: string) => Promise<void>;
  onMessage: (handler: (msg: TelegramBot.Message) => void) => void;
  onCommand: (command: string, handler: (msg: TelegramBot.Message) => void) => void;
  startPolling: () => void;
}

export function createTelegramClient(config: Config): TelegramClient {
  const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: false });

  async function sendMessage(
    chatId: number | string,
    text: string,
    parseMode?: 'Markdown' | 'HTML',
  ): Promise<void> {
    try {
      await bot.sendMessage(chatId, text, parseMode ? { parse_mode: parseMode } : {});
    } catch (err) {
      throw new Error(`Error sending Telegram message to chat ${chatId}: ${String(err)}`);
    }
  }

  async function reactToMessage(chatId: number, messageId: number, emoji: string): Promise<void> {
    try {
      const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/setMessageReaction`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          reaction: [{ type: 'emoji', emoji }],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }
    } catch (err) {
      throw new Error(
        `Error reacting to message ${messageId} in chat ${chatId}: ${String(err)}`,
      );
    }
  }

  function onMessage(handler: (msg: TelegramBot.Message) => void): void {
    bot.on('message', handler);
  }

  function onCommand(command: string, handler: (msg: TelegramBot.Message) => void): void {
    bot.onText(new RegExp(`^\\/${command}(?:@\\w+)?(?:\\s|$)`), handler);
  }

  function startPolling(): void {
    bot.startPolling();
  }

  return { sendMessage, reactToMessage, onMessage, onCommand, startPolling };
}
