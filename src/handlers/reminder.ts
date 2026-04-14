import type { NotionClient, Chore } from '../notion';
import type { TelegramClient } from '../telegram';
import type { Config } from '../config';

function groupByAssignee(chores: Chore[]): Map<string | null, Chore[]> {
  const groups = new Map<string | null, Chore[]>();
  for (const chore of chores) {
    const key = chore.assignee === 'Shared' || chore.assignee === null ? null : chore.assignee;
    const group = groups.get(key) ?? [];
    group.push(chore);
    groups.set(key, group);
  }
  return groups;
}

function formatPersonBlock(name: string, chores: Chore[]): string {
  return `*${name}*\n${chores.map((c) => `• ${c.name}`).join('\n')}`;
}

function formatSection(header: string, chores: Chore[]): string {
  const groups = groupByAssignee(chores);
  const parts = [header];
  for (const [assignee, assigned] of groups) {
    if (assignee !== null) parts.push(formatPersonBlock(assignee, assigned));
  }
  const shared = groups.get(null);
  if (shared && shared.length > 0) parts.push(formatPersonBlock('Either of you', shared));
  return parts.join('\n\n');
}

function buildMessage(overdueShort: Chore[], weeklyDue: Chore[]): string {
  const sections: string[] = ['🏠 Morning!'];

  if (overdueShort.length > 0) {
    sections.push(
      formatSection('👀 *Checking in — did these get done?*', overdueShort),
    );
  }

  if (weeklyDue.length > 0) {
    sections.push(
      formatSection('📅 *On the agenda this week:*', weeklyDue),
    );
  }

  return sections.join('\n\n');
}

export function createReminderHandler(
  notion: NotionClient,
  telegram: TelegramClient,
  config: Config,
) {
  async function sendReminder(now: Date): Promise<void> {
    const isSunday = now.getDay() === 0;
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const allDue = await notion.getDueChores(now);

    // Short-frequency chores (<7 days): only show when strictly overdue or never done
    const overdueShort = allDue.filter(
      (c) =>
        c.frequencyDays !== null &&
        c.frequencyDays < 7 &&
        (c.nextDue === null || c.nextDue < startOfToday),
    );

    // Long-frequency chores (>=7 days, or no frequency set): only surface on Sundays
    const weeklyDue = isSunday
      ? allDue.filter((c) => c.frequencyDays === null || c.frequencyDays >= 7)
      : [];

    if (overdueShort.length === 0 && weeklyDue.length === 0) {
      if (isSunday) {
        await telegram.sendMessage(
          config.TELEGRAM_CHAT_ID,
          '✅ All caught up — nothing needs doing this week!',
        );
      }
      return;
    }

    const message = buildMessage(overdueShort, weeklyDue);
    await telegram.sendMessage(config.TELEGRAM_CHAT_ID, message, 'Markdown');
  }

  return { sendReminder };
}

export type ReminderHandler = ReturnType<typeof createReminderHandler>;
