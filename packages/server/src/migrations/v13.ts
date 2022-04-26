import { PoolClient } from 'pg';

export async function run(client: PoolClient): Promise<void> {
  await client.query('ALTER TABLE "ServiceRequest" ALTER COLUMN "orderDetail" DROP NOT NULL');
  await client.query(`ALTER TABLE "UserConfiguration" ALTER COLUMN "name" DROP NOT NULL`);
}
