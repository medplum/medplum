import { mkdirSync, writeFileSync } from 'fs';
import { Knex } from 'knex';
import path from 'path';

export async function seed(knex: Knex): Promise<void> {
  await knex('Binary').del();
  await knex('Binary_History').del();
  await knex('Patient').del();
  await knex('Patient_History').del();

  await knex('Binary').insert([
    {
      id: '2e9dfab6-a3af-4e5b-9324-483b4c333736',
      content: `{
        "id":"2e9dfab6-a3af-4e5b-9324-483b4c333736",
        "meta":{"versionId":"101a87e5-1c22-4d9c-b1ff-22d53303fd92"},
        "contentType":"text/plain"
      }`,
      lastUpdated: '2021-06-01T00:00:00'
    }
  ]);

  await knex('Patient').insert([
    {
      id: '8a54c7db-654b-4c3d-ba85-e0909f51c12b',
      content: '{}',
      lastUpdated: '2021-06-01T00:00:00'
    }
  ]);

  await knex('Patient_History').insert([
    {
      versionId: '6eef5db6-534d-4de2-b1d4-212a2df0e5cd',
      id: '8a54c7db-654b-4c3d-ba85-e0909f51c12b',
      content: '{}',
      lastUpdated: '2021-06-01T00:00:00'
    }
  ]);

  mkdirSync(path.resolve(__dirname, '../../binary/2e9dfab6-a3af-4e5b-9324-483b4c333736'), { recursive: true });

  writeFileSync(
    path.resolve(__dirname, '../../binary/2e9dfab6-a3af-4e5b-9324-483b4c333736/101a87e5-1c22-4d9c-b1ff-22d53303fd92'),
    'Hello world');
}
