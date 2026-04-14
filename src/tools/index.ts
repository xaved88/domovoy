import type Anthropic from '@anthropic-ai/sdk';

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'log_chore',
    description:
      'Log that one or more chores have been completed by a household member. Include every chore mentioned in the message.',
    input_schema: {
      type: 'object' as const,
      properties: {
        chore_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'The Notion page IDs of all completed chores. May contain more than one.',
        },
        done_by: {
          type: 'string',
          description: 'The name of the person who completed the chores.',
        },
      },
      required: ['chore_ids', 'done_by'],
    },
  },
  {
    name: 'request_clarification',
    description:
      'Ask the user to clarify which chore they meant when the message is ambiguous.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description: 'The clarification question to send back to the user.',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'unrecognised',
    description: 'The message is clearly not about completing a chore.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];
