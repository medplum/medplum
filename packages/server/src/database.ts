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
    client: 'pg',
    connection: {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      timezone: 'UTC'
    },
    useNullAsDefault: true
  });

  await knex.migrate.latest({ directory: path.resolve(__dirname, 'migrations') });
}

export async function closeDatabase(): Promise<void> {
  if (knex) {
    await knex.destroy();
    knex = undefined;
  }
}

/**
 * Placeholder to "execute the query".
 * This is a passthrough function, and should not be necessary.
 * It reduces the noise in SonarJS static analysis, because SonarJS
 * does not properly interpret Knex promises.
 * See: https://github.com/SonarSource/SonarJS/issues/2658
 * @param result The query result.
 * @returns
 */
export async function executeQuery<T>(result: T): Promise<T> {
  return result;
}
