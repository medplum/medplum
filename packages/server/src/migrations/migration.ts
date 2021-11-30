import { PoolClient } from 'pg';

export interface Migration {
  run(client: PoolClient): Promise<void>;
}
