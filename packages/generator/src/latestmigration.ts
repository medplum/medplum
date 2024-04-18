import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { migrate } from '../../server/src/migrations/migrations';
import { FileBuilder } from './filebuilder';

const SCHEMA_DIR = resolve(__dirname, '../../server/src/migrations/schema');

process.on('SIGINT', () => {
  console.log('Gracefully quitting process...');
  // @ts-expect-error Not a public method
  const activeHandles = process._getActiveHandles() as any[];
  if (activeHandles.length) {
    console.log('Active handles:', activeHandles);
  }
  process.exit(1);
});

async function main(): Promise<void> {
  // Start clean database...
  console.info('Starting Postgres container...');
  const container = await new PostgreSqlContainer().start();
  const pool = new Pool({ connectionString: container.getConnectionUri() });
  const client = await pool.connect();
  console.info('Connected to pool... Running migrations...');

  // Run migrations
  await migrate(client, true);

  // Dump resulting schema
  const { stdout } = spawn(
    'pg_dump',
    [
      '-h',
      container.getHost(),
      '-p',
      container.getPort().toString(),
      '-U',
      container.getUsername(),
      '--schema-only',
      '--no-owner',
      container.getDatabase(),
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PGPASSWORD: 'test' },
    }
  );

  let dump = '';
  stdout.setEncoding('utf-8');
  stdout.on('data', (data) => {
    dump += data;
  });

  await new Promise<void>((resolve) => {
    stdout.on('close', () => {
      resolve();
    });
  });

  console.info('Database dump successful. Writing dump to file...');

  const builder = new FileBuilder();
  buildLatestMigration(builder, dump);
  writeFileSync(`${SCHEMA_DIR}/latest.ts`, builder.toString(), 'utf8');

  console.info('Migration file successfully created.');

  client.release();
  await pool.end();
  await container.stop();
}

function buildLatestMigration(b: FileBuilder, sqlDump: string): void {
  b.append("import { PoolClient } from 'pg';");
  b.newLine();
  b.append('export async function run(client: PoolClient): Promise<void> {');
  b.indentCount++;

  b.newLine();
  b.appendNoWrap('await client.query(`');
  b.indentCount--;

  b.appendNoWrap(sqlDump);

  b.append('`);');
  b.append('}');
}

main().catch(console.error);
