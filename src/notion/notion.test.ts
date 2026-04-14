import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createNotionClient, isActiveInMonth } from './index';
import type { Chore } from './index';
import type { Config } from '../config';

const mockQuery = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockDbRetrieve = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());

vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockReturnValue({
    databases: { query: mockQuery, retrieve: mockDbRetrieve, update: mockDbUpdate },
    pages: { update: mockUpdate, create: mockCreate },
  }),
}));

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

function makeChorePage(overrides: {
  id?: string;
  name?: string;
  assignee?: string | null;
  frequencyDays?: number | null;
  frequencyLabel?: string | null;
  lastDoneStart?: string | null;
  nextDueStart?: string | null;
  activeFromMonth?: number | null;
  activeUntilMonth?: number | null;
  muted?: boolean;
} = {}) {
  const o = {
    id: 'chore-id',
    name: 'Test Chore',
    assignee: 'Shared' as string | null,
    frequencyDays: 7 as number | null,
    frequencyLabel: 'Weekly' as string | null,
    lastDoneStart: '2026-04-01' as string | null,
    nextDueStart: '2026-04-08' as string | null,
    activeFromMonth: null as number | null,
    activeUntilMonth: null as number | null,
    muted: false,
    ...overrides,
  };

  return {
    object: 'page',
    id: o.id,
    properties: {
      Name: { type: 'title', title: [{ plain_text: o.name }], id: 'n' },
      Assignee: {
        type: 'select',
        select: o.assignee ? { name: o.assignee, id: 'a', color: 'blue' } : null,
        id: 'as',
      },
      'Frequency Days': { type: 'number', number: o.frequencyDays, id: 'fd' },
      'Frequency Label': {
        type: 'select',
        select: o.frequencyLabel ? { name: o.frequencyLabel, id: 'fl', color: 'blue' } : null,
        id: 'fls',
      },
      'Last Done': {
        type: 'date',
        date: o.lastDoneStart ? { start: o.lastDoneStart, end: null, time_zone: null } : null,
        id: 'ld',
      },
      'Next Due': {
        type: 'formula',
        formula: o.nextDueStart
          ? { type: 'date', date: { start: o.nextDueStart, end: null, time_zone: null } }
          : { type: 'date', date: null },
        id: 'nd',
      },
      'Active From Month': { type: 'number', number: o.activeFromMonth, id: 'afm' },
      'Active Until Month': { type: 'number', number: o.activeUntilMonth, id: 'aum' },
      Muted: { type: 'checkbox', checkbox: o.muted, id: 'm' },
    },
  };
}

function mockQueryOnce(pages: ReturnType<typeof makeChorePage>[], hasMore = false, nextCursor: string | null = null) {
  mockQuery.mockResolvedValueOnce({ results: pages, has_more: hasMore, next_cursor: nextCursor });
}

describe('createNotionClient', () => {
  let notion: ReturnType<typeof createNotionClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    notion = createNotionClient(mockConfig);
  });

  describe('listChores', () => {
    it('returns correctly parsed chores', async () => {
      mockQueryOnce([makeChorePage({ name: 'Wash towels', assignee: 'Logan', frequencyDays: 7 })]);
      const chores = await notion.listChores();
      expect(chores).toHaveLength(1);
      expect(chores[0]).toMatchObject({
        name: 'Wash towels',
        assignee: 'Logan',
        frequencyDays: 7,
        frequencyLabel: 'Weekly',
        muted: false,
      });
      expect(chores[0].lastDone).toEqual(new Date('2026-04-01'));
      expect(chores[0].nextDue).toEqual(new Date('2026-04-08'));
    });

    it('handles null optional fields', async () => {
      mockQueryOnce([
        makeChorePage({
          assignee: null,
          frequencyDays: null,
          frequencyLabel: null,
          lastDoneStart: null,
          nextDueStart: null,
          activeFromMonth: null,
          activeUntilMonth: null,
        }),
      ]);
      const [chore] = await notion.listChores();
      expect(chore.assignee).toBeNull();
      expect(chore.frequencyDays).toBeNull();
      expect(chore.lastDone).toBeNull();
      expect(chore.nextDue).toBeNull();
      expect(chore.activeFromMonth).toBeNull();
      expect(chore.activeUntilMonth).toBeNull();
    });

    it('paginates through multiple result pages', async () => {
      mockQuery
        .mockResolvedValueOnce({
          results: [makeChorePage({ id: 'p1', name: 'Chore 1' })],
          has_more: true,
          next_cursor: 'cursor-abc',
        })
        .mockResolvedValueOnce({
          results: [makeChorePage({ id: 'p2', name: 'Chore 2' })],
          has_more: false,
          next_cursor: null,
        });

      const chores = await notion.listChores();
      expect(chores).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ start_cursor: 'cursor-abc' }),
      );
    });

    it('skips partial page objects', async () => {
      mockQuery.mockResolvedValueOnce({
        results: [{ object: 'page', id: 'partial-id' }], // no properties
        has_more: false,
        next_cursor: null,
      });
      const chores = await notion.listChores();
      expect(chores).toHaveLength(0);
    });

    it('throws with context on API error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Rate limited'));
      await expect(notion.listChores()).rejects.toThrow(
        'Error listing chores from Notion',
      );
    });
  });

  describe('getDueChores', () => {
    it('returns chores where nextDue is on or before asOf', async () => {
      mockQueryOnce([
        makeChorePage({ id: 'c1', name: 'Overdue', nextDueStart: '2026-04-05' }),
        makeChorePage({ id: 'c2', name: 'Due today', nextDueStart: '2026-04-10' }),
        makeChorePage({ id: 'c3', name: 'Not due yet', nextDueStart: '2026-04-15' }),
      ]);
      const due = await notion.getDueChores(new Date('2026-04-10'));
      expect(due.map((c) => c.name)).toEqual(['Overdue', 'Due today']);
    });

    it('includes chores with null nextDue (never done)', async () => {
      mockQueryOnce([
        makeChorePage({ name: 'Never done', lastDoneStart: null, nextDueStart: null }),
      ]);
      const due = await notion.getDueChores(new Date('2026-04-10'));
      expect(due).toHaveLength(1);
    });

    it('excludes muted chores', async () => {
      mockQueryOnce([
        makeChorePage({ name: 'Kitty food', muted: true, nextDueStart: '2026-04-01' }),
      ]);
      const due = await notion.getDueChores(new Date('2026-04-10'));
      expect(due).toHaveLength(0);
    });

    it('excludes out-of-season chores', async () => {
      // April (month 4) — summer chores (May–Sep) should be excluded
      mockQueryOnce([
        makeChorePage({
          name: 'Lawn',
          nextDueStart: '2026-04-01',
          activeFromMonth: 5,
          activeUntilMonth: 9,
        }),
      ]);
      const due = await notion.getDueChores(new Date('2026-04-10'));
      expect(due).toHaveLength(0);
    });

    it('includes in-season chores', async () => {
      // June (month 6) — summer chores (May–Sep) should be included
      mockQueryOnce([
        makeChorePage({
          name: 'Lawn',
          nextDueStart: '2026-06-01',
          activeFromMonth: 5,
          activeUntilMonth: 9,
        }),
      ]);
      const due = await notion.getDueChores(new Date('2026-06-10'));
      expect(due).toHaveLength(1);
    });

    it('includes wrap-around seasonal chores when in season', async () => {
      // January (month 1) — heater chores (Oct–Mar) should be included
      mockQueryOnce([
        makeChorePage({
          name: 'Heater maintenance',
          nextDueStart: '2026-01-01',
          activeFromMonth: 10,
          activeUntilMonth: 3,
        }),
      ]);
      const due = await notion.getDueChores(new Date('2026-01-10'));
      expect(due).toHaveLength(1);
    });

    it('excludes wrap-around seasonal chores when out of season', async () => {
      // June (month 6) — heater chores (Oct–Mar) should be excluded
      mockQueryOnce([
        makeChorePage({
          name: 'Heater maintenance',
          nextDueStart: '2026-06-01',
          activeFromMonth: 10,
          activeUntilMonth: 3,
        }),
      ]);
      const due = await notion.getDueChores(new Date('2026-06-10'));
      expect(due).toHaveLength(0);
    });
  });

  describe('updateLastDone', () => {
    it('calls pages.update with correct page_id and date-only string', async () => {
      mockUpdate.mockResolvedValueOnce({});
      await notion.updateLastDone('chore-abc', new Date('2026-04-10T14:30:00.000Z'));
      expect(mockUpdate).toHaveBeenCalledWith({
        page_id: 'chore-abc',
        properties: {
          'Last Done': { date: { start: '2026-04-10' } },
        },
      });
    });

    it('throws with context on error', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('Not found'));
      await expect(
        notion.updateLastDone('chore-abc', new Date()),
      ).rejects.toThrow('Error updating Last Done for chore "chore-abc" in Notion');
    });
  });

  describe('createLogEntry', () => {
    it('calls pages.create with correct params', async () => {
      mockCreate.mockResolvedValueOnce({});
      const doneAt = new Date('2026-04-10T14:30:00.000Z');
      await notion.createLogEntry('chore-abc', 'Logan', doneAt);
      expect(mockCreate).toHaveBeenCalledWith({
        parent: { database_id: 'test-log-db' },
        properties: {
          Name: { title: [] },
          Chore: { relation: [{ id: 'chore-abc' }] },
          'Done By': { select: { name: 'Logan' } },
          'Done At': { date: { start: doneAt.toISOString() } },
        },
      });
    });

    it('works with Yael as doneBy', async () => {
      mockCreate.mockResolvedValueOnce({});
      await notion.createLogEntry('chore-xyz', 'Yael', new Date());
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.objectContaining({
            'Done By': { select: { name: 'Yael' } },
          }),
        }),
      );
    });

    it('throws with context on error', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Unauthorized'));
      await expect(
        notion.createLogEntry('chore-abc', 'Logan', new Date()),
      ).rejects.toThrow('Error creating log entry for chore "chore-abc" in Notion');
    });
  });
});

describe('isActiveInMonth', () => {
  const base: Chore = {
    id: 'c',
    name: 'Test',
    assignee: null,
    frequencyDays: null,
    frequencyLabel: null,
    lastDone: null,
    nextDue: null,
    activeFromMonth: null,
    activeUntilMonth: null,
    muted: false,
  };

  it('returns true for year-round chores (both months null)', () => {
    expect(isActiveInMonth(base, 1)).toBe(true);
    expect(isActiveInMonth(base, 6)).toBe(true);
    expect(isActiveInMonth(base, 12)).toBe(true);
  });

  it('handles normal range inclusive boundaries (May–Sep)', () => {
    const chore = { ...base, activeFromMonth: 5, activeUntilMonth: 9 };
    expect(isActiveInMonth(chore, 5)).toBe(true);
    expect(isActiveInMonth(chore, 7)).toBe(true);
    expect(isActiveInMonth(chore, 9)).toBe(true);
    expect(isActiveInMonth(chore, 4)).toBe(false);
    expect(isActiveInMonth(chore, 10)).toBe(false);
  });

  it('handles wrap-around range inclusive boundaries (Oct–Mar)', () => {
    const chore = { ...base, activeFromMonth: 10, activeUntilMonth: 3 };
    expect(isActiveInMonth(chore, 10)).toBe(true);
    expect(isActiveInMonth(chore, 12)).toBe(true);
    expect(isActiveInMonth(chore, 1)).toBe(true);
    expect(isActiveInMonth(chore, 3)).toBe(true);
    expect(isActiveInMonth(chore, 4)).toBe(false);
    expect(isActiveInMonth(chore, 9)).toBe(false);
  });
});
