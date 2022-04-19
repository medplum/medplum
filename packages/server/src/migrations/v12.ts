import { PoolClient } from 'pg';

export async function run(client: PoolClient): Promise<void> {
  await client.query('CREATE INDEX ON "Address" ("resourceId")');
  await client.query('CREATE INDEX ON "ContactPoint" ("resourceId")');
  await client.query('CREATE INDEX ON "HumanName" ("resourceId")');
  await client.query('CREATE INDEX ON "Identifier" ("resourceId")');
}
