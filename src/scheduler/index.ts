import cron from 'node-cron';
import type { NotionClient } from '../notion';
import type { TelegramClient } from '../telegram';
import type { Config } from '../config';
import { createReminderHandler } from '../handlers/reminder';
import { createLogger } from '../logger';

const logger = createLogger('scheduler');

export function startScheduler(
  notion: NotionClient,
  telegram: TelegramClient,
  config: Config,
): void {
  const reminder = createReminderHandler(notion, telegram, config);

  cron.schedule(
    '0 9 * * *',
    async () => {
      logger.info('Running daily reminder');
      try {
        await reminder.sendReminder(new Date());
      } catch (err) {
        logger.error('Reminder failed', { error: String(err) });
        try {
          await telegram.sendMessage(
            Number(config.TELEGRAM_CHAT_ID),
            '⚠️ Could not fetch chores for the daily reminder — Notion may be unavailable. Please check manually.',
          );
        } catch (sendErr) {
          logger.error('Failed to send fallback message', { error: String(sendErr) });
        }
      }
    },
    { timezone: 'Europe/Berlin' },
  );

  logger.info('Scheduler started', { schedule: '09:00 Europe/Berlin' });
}
