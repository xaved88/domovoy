import Fuse from 'fuse.js';
import type { Chore } from '../notion';

// Patterns that indicate the user completed a chore. Capture group 1 = chore description.
const LOG_PATTERNS = [
  /^(?:i\s+)?(?:just\s+)?(?:did|finished|done|completed?|cleaned?)\s+(?:the\s+)?(.+)/i,
  /^(?:the\s+)?(.+?)\s+(?:is\s+)?done[.!]?$/i,
  /^just\s+(.+)/i,
];

// Fuse.js: 0 = perfect match, 1 = no match. Below this threshold = confident.
const MATCH_THRESHOLD = 0.4;

// If the #2 result is within this score delta of #1, the match is ambiguous → fall to Claude.
const AMBIGUITY_DELTA = 0.15;

export type FuzzyMatch = {
  choreId: string;
  choreName: string;
};

export function matchChoreByName(query: string, chores: Chore[]): FuzzyMatch | null {
  const fuse = new Fuse(chores, {
    keys: ['name'],
    includeScore: true,
    threshold: MATCH_THRESHOLD,
    ignoreLocation: true,
  });

  const results = fuse.search(query);
  if (results.length === 0) return null;

  const top = results[0];
  if (top.score === undefined || top.score > MATCH_THRESHOLD) return null;

  // Reject ambiguous matches where two chores score similarly
  if (results.length > 1 && results[1].score !== undefined) {
    if (results[1].score - top.score < AMBIGUITY_DELTA) return null;
  }

  return { choreId: top.item.id, choreName: top.item.name };
}

export function detectLogIntent(text: string): string | null {
  for (const pattern of LOG_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

export function fuzzyRoute(text: string, chores: Chore[]): FuzzyMatch | null {
  const choreQuery = detectLogIntent(text);
  if (!choreQuery) return null;
  return matchChoreByName(choreQuery, chores);
}
