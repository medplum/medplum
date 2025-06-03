import { Pool, PoolClient } from 'pg';
import { DatabaseMode } from '../database';
import { Repository } from '../fhir/repo';

export async function getDbClientFromRepo(repo: Repository): Promise<[PoolClient, () => void]> {
  // Get a client or a pool
  const clientOrPool = repo.getDatabaseClient(DatabaseMode.WRITER);
  let needToClose = false;
  let dbClient: PoolClient;

  // If we got a pool, get a client from it
  // We'll have to clean it up later
  // Otherwise, we are in a transaction and should use the PoolClient we have
  if (clientOrPool instanceof Pool) {
    dbClient = await clientOrPool.connect();
    needToClose = true;
  } else {
    dbClient = clientOrPool;
  }

  const callback = needToClose
    ? () => {
        dbClient.release(true);
      }
    : () => undefined;

  return [dbClient, callback];
}
