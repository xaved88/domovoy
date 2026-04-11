import cron from 'node-cron';
import type { NotionClient } from '../notion';
import type { TelegramClient } from '../telegram';
import type { Config } from '../config';
import { createReminderHandler } from '../handlers/reminder';

export function startScheduler(
  notion: NotionClient,
  telegram: TelegramClient,
  config: Config,
): void {
  const reminder = createReminderHandler(notion, telegram, config);

  cron.schedule(
    '0 9 * * *',
    async () => {
      console.log('[scheduler] Running daily reminder');
      try {
        await reminder.sendReminder(new Date());
      } catch (err) {
        console.error('[scheduler] Reminder failed:', String(err));
      }
    },
    { timezone: 'Europe/Berlin' },
  );

  console.log('Scheduler started (daily reminder at 09:00 Europe/Berlin)');
}
