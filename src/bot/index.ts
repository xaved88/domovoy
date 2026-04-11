import { Config } from '../config';
import { createTelegramClient } from '../telegram';

export function createBot(config: Config) {
  const telegram = createTelegramClient(config);
  const groupChatId = Number(config.TELEGRAM_CHAT_ID);

  // /ping — health check, only responds in the group chat
  telegram.onCommand('ping', async (msg) => {
    if (msg.chat.id !== groupChatId) return;
    try {
      await telegram.sendMessage(groupChatId, 'pong');
    } catch (err) {
      console.error('Error handling /ping:', String(err));
    }
  });

  // Log all incoming messages
  telegram.onMessage((msg) => {
    const ts = new Date(msg.date * 1000).toISOString();
    const chatId = msg.chat.id;
    const senderId = msg.from?.id ?? 'unknown';
    const text = msg.text ?? '<no text>';
    console.log(`[${ts}] chat=${chatId} sender=${senderId} text=${JSON.stringify(text)}`);
  });

  function start(): void {
    telegram.startPolling();
    console.log('Telegram bot polling started');
  }

  return { start };
}
