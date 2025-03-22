import * as postDeployMigrations from './data';
import * as preDeploymigrations from './schema';

export const MigrationVersion = {
  /**
   * MigrationVersion.FIRST_BOOT
   *
   * When first running server, the post-deploy version (i.e. "DatabaseMigration"."dataVersion")
   * is initialized to MigrationVersion.FIRST_BOOT to facilitate
   * more graceful handling of interruptions to the process of running post-deploy migrations
   * and the fatal version checks that can potentially halt the server if the first boot
   * doesn't make it to the steadystate of having run all post-deploy migrations.
   *
   * While dataVersion is FIRST_BOOT, there are a couple differences in behavior:
   *
   * 1. The `requiredVersion` checks from the post-deploy manifest file are skipped. This is
   *    because the server (specifically in dev mode) is sensitive to restarts while still in the
   *    process of running post-deploy migrations since since it would be possible to get in
   *    a state where the current server version is greater than the `requiredVersion` of a
   *    post-deploy migration. Normally that causes server to refuse to start up, but not so in
   *    FIRST_BOOT mode.
   *
   * 2. The "DatabaseMigration"."dataVersion" column is not updated as each post-deploy
   *    migration is run until the last/latest post-deploy migration completes successfully.
   *    This is what keeps the server in FIRST_BOOT mode until all post-deploy
   *    migrations have completed successfully. See {@link markPostDeployMigrationCompleted}
   *    for more details.
   */
  FIRST_BOOT: -2,
  UNKNOWN: -1,
  NONE: 0,
} as const;

/**
 * Gets a sorted array of all migration versions for the passed in migration module.
 *
 * Can be used for either the schema or data migrations modules.
 *
 * @param migrationModule - The migration module to read all migrations for. Either the schemaMigrations or dataMigrations module.
 * @returns All the numeric migration versions from a given migration module, either the schema or data migrations.
 */
function getMigrationVersions(migrationModule: Record<string, any>): number[] {
  const prefixedVersions = Object.keys(migrationModule).filter((key) => key.startsWith('v'));
  const migrationVersions = prefixedVersions.map((key) => Number.parseInt(key.slice(1), 10)).sort((a, b) => a - b);
  return migrationVersions;
}

let preDeployVersions: number[] | undefined;
let postDeployVersions: number[] | undefined;

/**
 * Gets a sorted array of all pre-deploy migration versions.
 *
 * @returns Sorted array of pre-deploy migration versions.
 */
export function getPreDeployMigrationVersions(): number[] {
  if (!preDeployVersions) {
    preDeployVersions = getMigrationVersions(preDeploymigrations);
  }
  return preDeployVersions;
}

/**
 * Gets a sorted array of all post-deploy migration versions.
 *
 * @returns Sorted array of post-deploy migration versions.
 */
export function getPostDeployMigrationVersions(): number[] {
  if (!postDeployVersions) {
    postDeployVersions = getMigrationVersions(postDeployMigrations);
  }
  return postDeployVersions;
}

export function getLatestPostDeployMigrationVersion(): number {
  const versions = getPostDeployMigrationVersions();
  return versions[versions.length - 1];
}
