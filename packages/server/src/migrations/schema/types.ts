import { PoolClient } from 'pg';

export interface PreDeployMigration {
  run(client: PoolClient): Promise<void>;
}
