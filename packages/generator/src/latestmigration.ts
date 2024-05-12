import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MedplumServerConfig } from '../../server/src/config';
import { main as serverMain } from '../../server/src/index';
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

  // Load existing `medplum.config.json`, change port
  const baseConfig = JSON.parse(
    readFileSync(resolve(__dirname, '../../server/medplum.config.json'), { encoding: 'utf-8' })
  ) as MedplumServerConfig;

  baseConfig.database.port = container.getPort();
  baseConfig.database.dbname = container.getDatabase();
  baseConfig.database.username = container.getUsername();
  baseConfig.database.password = container.getPassword();
  baseConfig.database.runMigrations = 'full';

  // Write latestmigration config
  writeFileSync(resolve(__dirname, '../../server/latestmigration.config.json'), JSON.stringify(baseConfig));

  // Startup server, triggering migration
  console.info('Starting server... Migrations will run...');
  const { shutdown } = await serverMain('file:latestmigration.config.json');

  // Cleanup config file
  rmSync(resolve(__dirname, '../../server/latestmigration.config.json'));

  // Shutdown when done
  console.info('Shutting down Medplum server...');
  await shutdown();

  console.info('Dumping database via pg_dump...');
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
      '--no-owner',
      '--no-acl',
      '--no-comments',
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

  mkdirSync(`${SCHEMA_DIR}/data`, { recursive: true });

  // TODO: Remove this
  writeFileSync(`${SCHEMA_DIR}/test.sql`, dump, 'utf-8');

  const builder = new FlatMigrationBuilder(dump);
  const migration = builder.buildMigration();
  writeFileSync(`${SCHEMA_DIR}/latest.ts`, migration, { encoding: 'utf-8' });

  console.info('Migration file successfully created.');

  await container.stop();
}

class FlatMigrationBuilder {
  readonly builder: FileBuilder;
  readonly sourceLines: string[];
  copyDataParser: CopyStatementDataParser | undefined;
  currentLine = 0;
  bufferedStatement: string[] | undefined;

  constructor(sqlDump: string) {
    this.builder = new FileBuilder();
    this.sourceLines = sqlDump.split('\n').map((line) => line.trim());
    this.bufferedStatement = undefined;
    this.copyDataParser = undefined;
  }

  private processCurrentLine(): boolean {
    // If we processed the last line already, return false signalling we are done
    if (this.currentLine === this.sourceLines.length) {
      return false;
    }

    // If line is empty, skip it
    const line = this.sourceLines[this.currentLine];
    if (line === '' || line.startsWith('--')) {
      this.currentLine++;
      return true;
    }

    // If the copyDataParser exists, that means we need to use it
    if (this.copyDataParser) {
      // If we find the copy terminal character sequence, finalize the file for this copy statement
      if (line.startsWith('\\.')) {
        // Finalize the data file
        this.copyDataParser.writeDataFile(`${SCHEMA_DIR}/data`);
        // Remove copyParser
        this.copyDataParser = undefined;

        // Go to next line
        this.currentLine++;
        return true;
      }

      // Otherwise if we don't see the terminal character sequence,
      // Parse the data line
      this.copyDataParser.parseDataLine(line);

      // Go to next line
      this.currentLine++;
      return true;
    }

    if (line.startsWith('COPY')) {
      const nextLine = this.peekNextLine();
      if (!nextLine) {
        throw new Error('Invalid SQL file: COPY statement not followed by data to copy or `.` like expected');
      }
      // Skip COPY statements that don't contain any data
      if (nextLine === '\\.') {
        this.currentLine += 2;
        return true;
      }
      // start building copy
      this.copyDataParser = new CopyStatementDataParser(line);
      this.currentLine++;
      return true;
    }

    this.bufferPartialStatement(line);
    this.currentLine++;
    return true;
  }

  private bufferPartialStatement(partialStatement: string): void {
    if (!this.bufferedStatement) {
      this.bufferedStatement = ["await client.query('"];
    } else {
      this.bufferedStatement.push(' ');
    }
    this.bufferedStatement.push(partialStatement.replaceAll("'", "\\'"));
    if (partialStatement.endsWith(';')) {
      this.endStatement();
    }
  }

  private endStatement(): void {
    if (!this.bufferedStatement) {
      throw new Error('No buffered statement to end');
    }
    this.bufferedStatement.push("');");
    this.builder.appendNoWrap(this.bufferedStatement.join(''));
    this.bufferedStatement = undefined;
  }

  private peekNextLine(): string | undefined {
    if (this.currentLine === this.sourceLines.length - 1) {
      return undefined;
    }
    return this.sourceLines[this.currentLine + 1];
  }

  buildMigration(): string {
    const b = this.builder;

    b.append("import { PoolClient } from 'pg';");
    b.newLine();
    b.append('export async function run(client: PoolClient): Promise<void> {');
    b.indentCount++;

    b.newLine();

    let line = false;
    do {
      line = this.processCurrentLine();
    } while (line);

    b.append('}');

    return b.toString();
  }
}

class CopyStatementDataParser {
  private dataFile = '';
  constructor(readonly copyStatement: string) {}

  parseDataLine(line: string): void {
    this.dataFile += `${line}\n`;
  }

  writeDataFile(dirPath: string): void {
    const filename = this.copyStatement.match(/public\."(.+?)"/)?.[1];
    if (!filename) {
      throw new Error(
        'Invalid migration file. Failed to match table name with the following pattern: `public."TABLE_NAME"`'
      );
    }
    writeFileSync(`${dirPath}/${filename}.tsv`, this.dataFile, { encoding: 'utf-8' });
  }
}

main().catch(console.error);
