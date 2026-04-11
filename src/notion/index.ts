import { Client } from '@notionhq/client';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import type { Config } from '../config';
import type { Person } from '../types';

export interface Chore {
  id: string;
  name: string;
  assignee: 'Logan' | 'Yael' | 'Shared' | null;
  frequencyDays: number | null;
  frequencyLabel: string | null;
  lastDone: Date | null;
  nextDue: Date | null;
  activeFromMonth: number | null;
  activeUntilMonth: number | null;
  muted: boolean;
}

function isFullPage(
  page: { object: string; [key: string]: unknown },
): page is PageObjectResponse {
  return page.object === 'page' && 'properties' in page;
}

function extractChore(page: PageObjectResponse): Chore {
  const p = page.properties;

  const nameProp = p['Name'];
  const name =
    nameProp.type === 'title'
      ? nameProp.title.map((t) => t.plain_text).join('')
      : '';

  const assigneeProp = p['Assignee'];
  const assignee =
    assigneeProp.type === 'select' && assigneeProp.select != null
      ? (assigneeProp.select.name as 'Logan' | 'Yael' | 'Shared')
      : null;

  const freqDaysProp = p['Frequency Days'];
  const frequencyDays =
    freqDaysProp.type === 'number' ? freqDaysProp.number : null;

  const freqLabelProp = p['Frequency Label'];
  const frequencyLabel =
    freqLabelProp.type === 'select' && freqLabelProp.select != null
      ? freqLabelProp.select.name
      : null;

  const lastDoneProp = p['Last Done'];
  const lastDone =
    lastDoneProp.type === 'date' && lastDoneProp.date != null
      ? new Date(lastDoneProp.date.start)
      : null;

  const nextDueProp = p['Next Due'];
  const nextDue =
    nextDueProp.type === 'formula' &&
    nextDueProp.formula.type === 'date' &&
    nextDueProp.formula.date != null
      ? new Date(nextDueProp.formula.date.start)
      : null;

  const fromProp = p['Active From Month'];
  const activeFromMonth =
    fromProp.type === 'number' ? fromProp.number : null;

  const untilProp = p['Active Until Month'];
  const activeUntilMonth =
    untilProp.type === 'number' ? untilProp.number : null;

  const mutedProp = p['Muted'];
  const muted = mutedProp.type === 'checkbox' ? mutedProp.checkbox : false;

  return {
    id: page.id,
    name,
    assignee,
    frequencyDays,
    frequencyLabel,
    lastDone,
    nextDue,
    activeFromMonth,
    activeUntilMonth,
    muted,
  };
}

export function isActiveInMonth(chore: Chore, month: number): boolean {
  const { activeFromMonth, activeUntilMonth } = chore;
  if (activeFromMonth === null || activeUntilMonth === null) return true;

  if (activeFromMonth <= activeUntilMonth) {
    // Normal range e.g. May–Sep (5–9)
    return month >= activeFromMonth && month <= activeUntilMonth;
  }
  // Wraps around year-end e.g. Oct–Mar (10–3)
  return month >= activeFromMonth || month <= activeUntilMonth;
}

export function createNotionClient(config: Config) {
  const client = new Client({ auth: config.NOTION_API_KEY });

  async function listChores(): Promise<Chore[]> {
    try {
      const chores: Chore[] = [];
      let cursor: string | undefined;

      do {
        const response = await client.databases.query({
          database_id: config.NOTION_CHORES_DB_ID,
          start_cursor: cursor,
        });

        for (const page of response.results) {
          if (!isFullPage(page)) continue;
          chores.push(extractChore(page));
        }

        cursor = response.has_more
          ? (response.next_cursor ?? undefined)
          : undefined;
      } while (cursor);

      return chores;
    } catch (err) {
      throw new Error(`Error listing chores from Notion: ${String(err)}`);
    }
  }

  async function getDueChores(asOf: Date): Promise<Chore[]> {
    const month = asOf.getMonth() + 1;
    const all = await listChores();
    return all.filter((chore) => {
      if (chore.muted) return false;
      if (!isActiveInMonth(chore, month)) return false;
      if (chore.nextDue === null) return true;
      return chore.nextDue <= asOf;
    });
  }

  async function updateLastDone(choreId: string, date: Date): Promise<void> {
    try {
      await client.pages.update({
        page_id: choreId,
        properties: {
          'Last Done': {
            date: { start: date.toISOString().split('T')[0] },
          },
        },
      });
    } catch (err) {
      throw new Error(
        `Error updating Last Done for chore "${choreId}" in Notion: ${String(err)}`,
      );
    }
  }

  async function createLogEntry(
    choreId: string,
    doneBy: Person,
    doneAt: Date,
  ): Promise<void> {
    try {
      await client.pages.create({
        parent: { database_id: config.NOTION_LOG_DB_ID },
        properties: {
          Name: { title: [] },
          Chore: { relation: [{ id: choreId }] },
          'Done By': { select: { name: doneBy } },
          'Done At': { date: { start: doneAt.toISOString() } },
        },
      });
    } catch (err) {
      throw new Error(
        `Error creating log entry for chore "${choreId}" in Notion: ${String(err)}`,
      );
    }
  }

  async function lookupMember(telegramId: string): Promise<Person | null> {
    try {
      const response = await client.databases.query({
        database_id: config.NOTION_MEMBERS_DB_ID,
        filter: {
          property: 'Telegram ID',
          title: { equals: telegramId },
        },
      });
      const page = response.results[0];
      if (!page || !isFullPage(page)) return null;
      const nameProp = page.properties['Name'];
      if (nameProp.type !== 'rich_text') return null;
      const name = nameProp.rich_text.map((t) => t.plain_text).join('').trim();
      return name === 'Logan' || name === 'Yael' ? name : null;
    } catch (err) {
      throw new Error(`Error looking up member "${telegramId}" in Notion: ${String(err)}`);
    }
  }

  async function isMemberNameTaken(name: Person): Promise<boolean> {
    try {
      const response = await client.databases.query({
        database_id: config.NOTION_MEMBERS_DB_ID,
        filter: {
          property: 'Name',
          rich_text: { equals: name },
        },
      });
      return response.results.length > 0;
    } catch (err) {
      throw new Error(`Error checking member name "${name}" in Notion: ${String(err)}`);
    }
  }

  async function registerMember(telegramId: string, name: Person): Promise<void> {
    try {
      await client.pages.create({
        parent: { database_id: config.NOTION_MEMBERS_DB_ID },
        properties: {
          'Telegram ID': { title: [{ text: { content: telegramId } }] },
          Name: { rich_text: [{ text: { content: name } }] },
        },
      });
    } catch (err) {
      throw new Error(`Error registering member "${name}" in Notion: ${String(err)}`);
    }
  }

  return { listChores, getDueChores, updateLastDone, createLogEntry, lookupMember, isMemberNameTaken, registerMember };
}

export type NotionClient = ReturnType<typeof createNotionClient>;
