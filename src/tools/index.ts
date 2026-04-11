import type Anthropic from '@anthropic-ai/sdk';

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'log_chore',
    description: 'Log that a chore has been completed by a household member.',
    input_schema: {
      type: 'object' as const,
      properties: {
        chore_id: {
          type: 'string',
          description: 'The Notion page ID of the completed chore.',
        },
        done_by: {
          type: 'string',
          enum: ['Logan', 'Yael'],
          description: 'The person who completed the chore.',
        },
      },
      required: ['chore_id', 'done_by'],
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
