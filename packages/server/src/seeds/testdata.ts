import { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('Patient').del();
  await knex('Patient_History').del();

  await knex('Patient').insert([
    {
      id: '8a54c7db-654b-4c3d-ba85-e0909f51c12b',
      content: JSON.stringify({
        resourceType: 'Patient',
        name: [{
          given: ['Alice'],
          family: 'Smith'
        }]
      }),
      lastUpdated: '2021-06-01T00:00:00',
      name: 'Alice Smith'
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
}
