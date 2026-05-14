import type { Config } from '../config';
import type { NotionClient } from '../notion';
import type { TelegramClient } from '../telegram';

export type CommandContext = {
  args: string;
  senderName: string;
  chatId: number;
  messageId: number;
  notion: NotionClient;
  telegram: TelegramClient;
  config: Config;
};

export type CommandHandler = (ctx: CommandContext) => Promise<void>;

export function createCommandRegistry() {
  const handlers = new Map<string, CommandHandler>();

  function register(name: string, handler: CommandHandler): void {
    handlers.set(name.toLowerCase(), handler);
  }

  function get(name: string): CommandHandler | undefined {
    return handlers.get(name.toLowerCase());
  }

  function names(): string[] {
    return [...handlers.keys()];
  }

  return { register, get, names };
}

export type CommandRegistry = ReturnType<typeof createCommandRegistry>;
