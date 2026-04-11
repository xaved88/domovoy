import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().min(1),
  NOTION_API_KEY: z.string().min(1),
  NOTION_CHORES_DB_ID: z.string().min(1),
  NOTION_LOG_DB_ID: z.string().min(1),
  NOTION_MEMBERS_DB_ID: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  TZ: z.string().default('Europe/Berlin'),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Missing or invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }
  return result.data;
}
