import * as Knex from 'knex';
import * as path from 'path';
import { MedplumDatabaseConfig } from './config';

// const POSTGRES_OPTIONS: Knex.Knex.Config = {
//   client: 'pg',
//   connection: {
//     host: 'localhost',
//     database: 'medplum',
//     user: 'medplum',
//     password: 'medplum'
//   }
// };

// const SQLITE_OPTIONS: Knex.Knex.Config = {
//   client: 'sqlite3',
//   connection: ':memory:',
//   useNullAsDefault: true
// };

// export const knex = Knex.knex(process.env.NODE_ENV === 'test' ? SQLITE_OPTIONS : POSTGRES_OPTIONS);

let knex: Knex.Knex | undefined;

export function getKnex(): Knex.Knex {
  if (!knex) {
    throw new Error('Database not setup');
  }
  return knex;
}

export async function initDatabase(config: MedplumDatabaseConfig): Promise<void> {
  //knex = Knex.knex(process.env.NODE_ENV === 'test' ? SQLITE_OPTIONS : POSTGRES_OPTIONS);
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
