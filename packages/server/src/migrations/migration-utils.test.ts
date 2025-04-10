import { getPostDeployMigration, MigrationDefinitionNotFoundError } from './migration-utils';

describe('getPostDeployMigration', () => {
  test('definition found', () => {
    expect(getPostDeployMigration(1)).toBeDefined();
  });

  test('migration definition not found', () => {
    expect(() => getPostDeployMigration(9999)).toThrow(MigrationDefinitionNotFoundError);
  });
});
