import TelegramBot from 'node-telegram-bot-api';
import { Config } from '../config';

export interface TelegramClient {
  sendMessage: (chatId: number | string, text: string) => Promise<void>;
  onMessage: (handler: (msg: TelegramBot.Message) => void) => void;
  onCommand: (command: string, handler: (msg: TelegramBot.Message) => void) => void;
  startPolling: () => void;
}

export function createTelegramClient(config: Config): TelegramClient {
  const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: false });

  async function sendMessage(chatId: number | string, text: string): Promise<void> {
    try {
      await bot.sendMessage(chatId, text);
    } catch (err) {
      throw new Error(`Error sending Telegram message to chat ${chatId}: ${String(err)}`);
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

  return { sendMessage, onMessage, onCommand, startPolling };
}
