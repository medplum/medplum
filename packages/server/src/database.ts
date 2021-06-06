import * as Knex from 'knex';
import path from 'path';
import { MedplumDatabaseConfig } from './config';

let knex: Knex.Knex | undefined;

export function getKnex(): Knex.Knex {
  if (!knex) {
    throw new Error('Database not setup');
  }
  return knex;
}

export async function initDatabase(config: MedplumDatabaseConfig): Promise<void> {
  knex = Knex.knex({
    client: config.client,
    connection: config.client === 'sqlite3' ? ':memory:' : {
      host: config.host,
      database: config.database,
      user: config.username,
      password: config.password
    },
    useNullAsDefault: true
  });

  await knex.migrate.latest({ directory: path.resolve(__dirname, 'migrations') });

  if (process.env.NODE_ENV === 'test') {
    await knex.seed.run({ directory: path.resolve(__dirname, 'seeds') });
  }
}

export async function closeDatabase(): Promise<void> {
  if (knex) {
    await knex.destroy();
    knex = undefined;
  }
}
