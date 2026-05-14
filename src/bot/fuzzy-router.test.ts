import { describe, it, expect } from 'vitest';
import { detectLogIntent, matchChoreByName, fuzzyRoute } from './fuzzy-router';
import type { Chore } from '../notion';

function makeChore(id: string, name: string): Chore {
  return {
    id,
    name,
    assignee: null,
    frequencyDays: null,
    frequencyLabel: null,
    lastDone: null,
    nextDue: null,
    activeFromMonth: null,
    activeUntilMonth: null,
    muted: false,
  };
}

const CHORES: Chore[] = [
  makeChore('1', 'wash dishes'),
  makeChore('2', 'vacuum living room'),
  makeChore('3', 'take out the bins'),
  makeChore('4', 'clean bathroom'),
  makeChore('5', 'do laundry'),
];

describe('detectLogIntent', () => {
  it('extracts chore query from "I did X"', () => {
    expect(detectLogIntent('I did the dishes')).toBe('dishes');
  });

  it('extracts chore query from "finished X"', () => {
    expect(detectLogIntent('finished laundry')).toBe('laundry');
  });

  it('extracts from "just done X"', () => {
    expect(detectLogIntent('just done the bins')).toBe('bins');
  });

  it('extracts from "X is done"', () => {
    expect(detectLogIntent('laundry is done')).toBe('laundry');
  });

  it('extracts from "X done"', () => {
    expect(detectLogIntent('dishes done')).toBe('dishes');
  });

  it('returns null for unrelated messages', () => {
    expect(detectLogIntent('what are we having for dinner?')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(detectLogIntent('')).toBeNull();
  });
});

describe('matchChoreByName', () => {
  it('matches an exact chore name', () => {
    const result = matchChoreByName('wash dishes', CHORES);
    expect(result).not.toBeNull();
    expect(result?.choreId).toBe('1');
  });

  it('matches a partial chore name (dishes → wash dishes)', () => {
    const result = matchChoreByName('dishes', CHORES);
    expect(result).not.toBeNull();
    expect(result?.choreId).toBe('1');
  });

  it('matches despite minor typo', () => {
    const result = matchChoreByName('vacumm', CHORES);
    expect(result).not.toBeNull();
    expect(result?.choreId).toBe('2');
  });

  it('returns null for a query with no close match', () => {
    const result = matchChoreByName('buy groceries', CHORES);
    expect(result).toBeNull();
  });

  it('returns null for ambiguous matches', () => {
    const ambiguousChores = [
      makeChore('a', 'clean bathroom'),
      makeChore('b', 'clean kitchen'),
    ];
    // "clean" is equally close to both
    const result = matchChoreByName('clean', ambiguousChores);
    expect(result).toBeNull();
  });
});

describe('fuzzyRoute', () => {
  it('routes "I did the dishes" to wash dishes', () => {
    const result = fuzzyRoute('I did the dishes', CHORES);
    expect(result).not.toBeNull();
    expect(result?.choreId).toBe('1');
  });

  it('routes "finished laundry" to do laundry', () => {
    const result = fuzzyRoute('finished laundry', CHORES);
    expect(result).not.toBeNull();
    expect(result?.choreId).toBe('5');
  });

  it('returns null for an unrecognised intent', () => {
    expect(fuzzyRoute('what is the weather like?', CHORES)).toBeNull();
  });

  it('returns null when intent matches but no chore does', () => {
    expect(fuzzyRoute('I did the grocery shopping', CHORES)).toBeNull();
  });
});
