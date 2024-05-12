import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MedplumServerConfig } from '../../server/src/config';
import { main as serverMain } from '../../server/src/index';
import { FileBuilder } from './filebuilder';

const SCHEMA_DIR = resolve(__dirname, '../../server/src/migrations/schema');

process.on('SIGINT', () => {
  console.info('Gracefully quitting process...');
  // @ts-expect-error Not a public method
  const activeHandles = process._getActiveHandles() as any[];
  if (activeHandles.length) {
    console.info('Active handles:', activeHandles);
  }
  process.exit(1);
});

async function main(): Promise<void> {
  // Start clean database...
  console.info('Starting Postgres container...');
  const container = await new PostgreSqlContainer().start();

  // Load existing `medplum.config.json`, change port
  const config = JSON.parse(
    readFileSync(resolve(__dirname, '../../server/medplum.config.json'), { encoding: 'utf-8' })
  ) as MedplumServerConfig;

  config.database.port = container.getPort();
  config.database.dbname = container.getDatabase();
  config.database.username = container.getUsername();
  config.database.password = container.getPassword();
  config.database.runMigrations = 'full';

  // Write latestmigration config
  writeFileSync(resolve(__dirname, '../../server/latestmigration.config.json'), JSON.stringify(config));

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

  let dump = 'SET search_path TO public;\n';
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
  const migration = new FlatMigrationBuilder(dump).buildMigration();
  writeFileSync(`${SCHEMA_DIR}/latest.sql`, migration, { encoding: 'utf-8' });

  console.info('Migration file successfully created.');

  await container.stop();
}

class FlatMigrationBuilder {
  readonly builder: FileBuilder;
  readonly sourceLines: string[];
  copyDataParser: CopyStatementDataParser | undefined;
  bufferedStatement: string[] | undefined;
  currentLine = 0;
  migration = '';

  constructor(sqlDump: string) {
    this.builder = new FileBuilder();
    this.sourceLines = sqlDump.split('\n');
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
    if (line.trim() === '' || line.startsWith('--')) {
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
      // Parse the line as part of the data file
      this.copyDataParser.parseDataLine(line);

      // Go to next line
      this.currentLine++;
      return true;
    }

    // If we find a line starting with COPY, buffer the line and the subsequent lines should be treated as table data
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
      // Start building copy data
      this.copyDataParser = new CopyStatementDataParser(line);
      this.bufferPartialStatement(line);
      this.currentLine++;
      return true;
    }

    this.bufferPartialStatement(line);
    this.currentLine++;
    return true;
  }

  private bufferPartialStatement(partialStatement: string): void {
    if (!this.bufferedStatement) {
      this.bufferedStatement = [];
    } else {
      this.bufferedStatement.push(' ');
    }
    const trimmedStatement = partialStatement.trim();
    this.bufferedStatement.push(trimmedStatement);
    if (trimmedStatement.endsWith(';')) {
      this.endStatement();
    }
  }

  private endStatement(): void {
    if (!this.bufferedStatement) {
      throw new Error('No buffered statement to end');
    }
    this.migration += this.bufferedStatement.join('') + '\n';
    this.bufferedStatement = undefined;
  }

  private peekNextLine(): string | undefined {
    if (this.currentLine === this.sourceLines.length - 1) {
      return undefined;
    }
    return this.sourceLines[this.currentLine + 1];
  }

  buildMigration(): string {
    let line = false;
    do {
      line = this.processCurrentLine();
    } while (line);
    return this.migration;
  }
}

class CopyStatementDataParser {
  private dataFile = '';
  constructor(readonly copyStatement: string) {}

  parseDataLine(line: string): void {
    this.dataFile += line + '\n';
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
