export const SqlDialect = {
  POSTGRES: 'postgres',
  SQLITE: 'sqlite',
} as const;

export type SqlDialect = (typeof SqlDialect)[keyof typeof SqlDialect];
