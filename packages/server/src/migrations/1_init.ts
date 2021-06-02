import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const resourceTypes = ['Binary', 'Patient'];

  for (const resourceType of resourceTypes) {
    await knex.schema.createTable(resourceType, t => {
      t.uuid('id').notNullable().primary();
      t.text('content').notNullable();
      t.dateTime('lastUpdated').notNullable();
    });

    await knex.schema.createTable(resourceType + '_History', t => {
      t.uuid('versionId').notNullable().primary();
      t.uuid('id').notNullable();
      t.text('content').notNullable();
      t.dateTime('lastUpdated').notNullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // TODO
}
