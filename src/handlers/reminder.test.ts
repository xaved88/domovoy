import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createReminderHandler } from './reminder';
import type { Chore } from '../notion';
import type { NotionClient } from '../notion';
import type { TelegramClient } from '../telegram';
import type { Config } from '../config';

const mockConfig: Config = {
  TELEGRAM_BOT_TOKEN: 'test-token',
  TELEGRAM_CHAT_ID: 'test-chat-id',
  NOTION_API_KEY: 'test-notion-key',
  NOTION_CHORES_DB_ID: 'test-chores-db',
  NOTION_LOG_DB_ID: 'test-log-db',
  NOTION_MEMBERS_DB_ID: 'test-members-db',
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  TZ: 'Europe/Berlin',
};

function makeChore(overrides: Partial<Chore> = {}): Chore {
  return {
    id: 'chore-id',
    name: 'Test Chore',
    assignee: 'Logan',
    frequencyDays: 1,
    frequencyLabel: 'Daily',
    lastDone: null,
    nextDue: null,
    activeFromMonth: null,
    activeUntilMonth: null,
    muted: false,
    ...overrides,
  };
}

// A Sunday in Berlin: 2026-04-12 (Sunday) at 09:00 UTC+2 → 07:00 UTC
const SUNDAY = new Date('2026-04-12T09:00:00+02:00');
// A Wednesday: 2026-04-08 (Wednesday) at 09:00 Berlin
const WEDNESDAY = new Date('2026-04-08T09:00:00+02:00');
// Start of today for WEDNESDAY (midnight Berlin = 2026-04-08T00:00:00+02:00)
const WED_START = new Date('2026-04-08T00:00:00+02:00');

describe('createReminderHandler', () => {
  let mockNotion: NotionClient;
  let mockTelegram: TelegramClient;

  beforeEach(() => {
    mockNotion = {
      listChores: vi.fn(),
      getDueChores: vi.fn(),
      updateLastDone: vi.fn(),
      createLogEntry: vi.fn(),
      createBonusLogEntry: vi.fn(),
      lookupMember: vi.fn(),
      listMemberNames: vi.fn(),
      isMemberNameTaken: vi.fn(),
      registerMember: vi.fn(),
      addChoreAssigneeOption: vi.fn(),
    };
    mockTelegram = {
      sendMessage: vi.fn(),
      reactToMessage: vi.fn(),
      onMessage: vi.fn(),
      onCommand: vi.fn(),
      startPolling: vi.fn(),
    };
  });

  describe('non-Sunday behaviour', () => {
    it('stays silent when no short-freq chores are overdue', async () => {
      vi.mocked(mockNotion.getDueChores).mockResolvedValue([]);
      const handler = createReminderHandler(mockNotion, mockTelegram, mockConfig);
      await handler.sendReminder(WEDNESDAY);
      expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
    });

    it('stays silent when only weekly chores are due on a non-Sunday', async () => {
      const weeklyChore = makeChore({
        frequencyDays: 7,
        nextDue: new Date('2026-04-08T00:00:00+02:00'),
      });
      vi.mocked(mockNotion.getDueChores).mockResolvedValue([weeklyChore]);
      const handler = createReminderHandler(mockNotion, mockTelegram, mockConfig);
      await handler.sendReminder(WEDNESDAY);
      expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
    });

    it('sends a message when a short-freq chore is overdue', async () => {
      const overdueChore = makeChore({
        name: 'Dishes',
        frequencyDays: 1,
        nextDue: new Date('2026-04-07T00:00:00+02:00'), // yesterday
      });
      vi.mocked(mockNotion.getDueChores).mockResolvedValue([overdueChore]);
      const handler = createReminderHandler(mockNotion, mockTelegram, mockConfig);
      await handler.sendReminder(WEDNESDAY);
      expect(mockTelegram.sendMessage).toHaveBeenCalledOnce();
      const [, text, parseMode] = vi.mocked(mockTelegram.sendMessage).mock.calls[0];
      expect(parseMode).toBe('Markdown');
      expect(text).toContain('Checking in');
      expect(text).toContain('Dishes');
    });

    it('does not include a short-freq chore due exactly today as overdue', async () => {
      const dueToday = makeChore({
        name: 'Dishes',
        frequencyDays: 1,
        nextDue: WED_START, // midnight today = due today, not overdue
      });
      vi.mocked(mockNotion.getDueChores).mockResolvedValue([dueToday]);
      const handler = createReminderHandler(mockNotion, mockTelegram, mockConfig);
      await handler.sendReminder(WEDNESDAY);
      expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Sunday behaviour', () => {
    it('sends "all caught up" when nothing is due', async () => {
      vi.mocked(mockNotion.getDueChores).mockResolvedValue([]);
      const handler = createReminderHandler(mockNotion, mockTelegram, mockConfig);
      await handler.sendReminder(SUNDAY);
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        mockConfig.TELEGRAM_CHAT_ID,
        expect.stringContaining('All caught up'),
      );
    });

    it('includes weekly chores on Sunday', async () => {
      const weeklyChore = makeChore({
        name: 'Vacuum',
        frequencyDays: 7,
        nextDue: new Date('2026-04-12T00:00:00+02:00'),
      });
      vi.mocked(mockNotion.getDueChores).mockResolvedValue([weeklyChore]);
      const handler = createReminderHandler(mockNotion, mockTelegram, mockConfig);
      await handler.sendReminder(SUNDAY);
      const [, text] = vi.mocked(mockTelegram.sendMessage).mock.calls[0];
      expect(text).toContain('On the agenda this week');
      expect(text).toContain('Vacuum');
    });

    it('shows both overdue and weekly sections when both apply', async () => {
      const overdue = makeChore({ name: 'Dishes', frequencyDays: 1, nextDue: new Date('2026-04-11T00:00:00+02:00') });
      const weekly = makeChore({ name: 'Vacuum', assignee: 'Yael', frequencyDays: 7, nextDue: new Date('2026-04-12T00:00:00+02:00') });
      vi.mocked(mockNotion.getDueChores).mockResolvedValue([overdue, weekly]);
      const handler = createReminderHandler(mockNotion, mockTelegram, mockConfig);
      await handler.sendReminder(SUNDAY);
      const [, text] = vi.mocked(mockTelegram.sendMessage).mock.calls[0];
      expect(text).toContain('Checking in');
      expect(text).toContain('Dishes');
      expect(text).toContain('On the agenda this week');
      expect(text).toContain('Vacuum');
    });
  });

  describe('message formatting', () => {
    it('groups chores by assignee', async () => {
      const chores = [
        makeChore({ name: 'Dishes', assignee: 'Logan', frequencyDays: 1, nextDue: new Date('2026-04-07T00:00:00+02:00') }),
        makeChore({ name: 'Laundry', assignee: 'Yael', frequencyDays: 2, nextDue: new Date('2026-04-07T00:00:00+02:00') }),
        makeChore({ name: 'Bins', assignee: 'Shared', frequencyDays: 3, nextDue: new Date('2026-04-07T00:00:00+02:00') }),
      ];
      vi.mocked(mockNotion.getDueChores).mockResolvedValue(chores);
      const handler = createReminderHandler(mockNotion, mockTelegram, mockConfig);
      await handler.sendReminder(WEDNESDAY);
      const [, text] = vi.mocked(mockTelegram.sendMessage).mock.calls[0];
      expect(text).toContain('*Logan*');
      expect(text).toContain('*Yael*');
      expect(text).toContain('*Either of you*');
    });

    it('includes never-done short-freq chores as overdue', async () => {
      const neverDone = makeChore({ name: 'Dishes', frequencyDays: 1, nextDue: null });
      vi.mocked(mockNotion.getDueChores).mockResolvedValue([neverDone]);
      const handler = createReminderHandler(mockNotion, mockTelegram, mockConfig);
      await handler.sendReminder(WEDNESDAY);
      const [, text] = vi.mocked(mockTelegram.sendMessage).mock.calls[0];
      expect(text).toContain('Dishes');
    });
  });
});
