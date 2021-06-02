import * as Knex from 'knex';
import * as path from 'path';

const POSTGRES_OPTIONS: Knex.Knex.Config = {
  client: 'pg',
  connection: {
    host: 'localhost',
    database: 'medplum',
    user: 'medplum',
    password: 'medplum'
  }
};

const SQLITE_OPTIONS: Knex.Knex.Config = {
  client: 'sqlite3',
  connection: ':memory:',
  useNullAsDefault: true
};

export const knex = Knex.knex(process.env.NODE_ENV === 'test' ? SQLITE_OPTIONS : POSTGRES_OPTIONS);

export async function initDatabase(): Promise<void> {
  await knex.migrate.latest({ directory: path.resolve(__dirname, 'migrations') });

  if (process.env.NODE_ENV === 'test') {
    await knex.seed.run({ directory: path.resolve(__dirname, 'seeds') });
  }
}

export async function closeDatabase(): Promise<void> {
  return knex.destroy();
}
