import * as Knex from 'knex';

export const knex = Knex.knex({
  client: 'pg',
  connection: {
    host: 'localhost',
    database: 'medplum',
    user: 'medplum',
    password: 'medplum'
  }
});
