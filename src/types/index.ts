export type Person = 'Logan' | 'Yael';

export interface Household {
  users: {
    logan: { telegramId: string; name: Person };
    yael: { telegramId: string; name: Person };
  };
  notion: {
    choresDbId: string;
    logDbId: string;
  };
}
