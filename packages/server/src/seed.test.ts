import { loadTestConfig } from './config';
import { closeDatabase, initDatabase } from './database';
import { getAdminUser, getDefaultClientApplication, getMedplumProject, getPublicProject, seedDatabase } from './seed';

describe('Seed', () => {

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Seeder completes successfully', async () => {
    expect(() => getAdminUser()).toThrow();
    expect(() => getMedplumProject()).toThrow();
    expect(() => getPublicProject()).toThrow();
    expect(() => getDefaultClientApplication()).toThrow();

    // First time, seeder should run
    await seedDatabase();

    // Second time, seeder should silently ignore
    await seedDatabase();

    expect(() => getAdminUser()).not.toThrow();
    expect(() => getMedplumProject()).not.toThrow();
    expect(() => getPublicProject()).not.toThrow();
    expect(() => getDefaultClientApplication()).not.toThrow();
  });

});
