// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Command } from 'commander';
import { config } from 'dotenv';
import { downloadParquetFiles } from './download.js';
import { exportData } from './export.js';

config();

export async function main(args: string[]): Promise<void> {
  const program = new Command();

  program
    .name('medplum-data-warehouse')
    .description('Export Medplum Postgres data to S3 via DuckDB Iceberg tables')
    .version('5.1.7');

  program
    .command('export')
    .description('Export AuditEvent data to Iceberg')
    .option('-d, --database-url <url>', 'Postgres Database URL', process.env.MEDPLUM_DATABASE_URL)
    .option('--db-host <host>', 'Postgres Database Host', process.env.MEDPLUM_DATABASE_HOST)
    .option('--db-port <port>', 'Postgres Database Port', process.env.MEDPLUM_DATABASE_PORT || '5432')
    .option('--db-name <dbname>', 'Postgres Database Name', process.env.MEDPLUM_DATABASE_DBNAME)
    .option('--db-username <username>', 'Postgres Database Username', process.env.MEDPLUM_DATABASE_USERNAME)
    .option('--db-password <password>', 'Postgres Database Password', process.env.MEDPLUM_DATABASE_PASSWORD)
    .option('-s, --s3-bucket <bucket>', 'S3 Bucket name', process.env.S3_BUCKET)
    .option('-r, --s3-region <region>', 'S3 Region', process.env.AWS_REGION || 'us-east-1')
    .option('-a, --aws-s3-table-arn <arn>', 'AWS S3 Table ARN (optional)', process.env.AWS_S3_TABLE_ARN)
    .option('--start-window <start>', 'Start window timestamp (ISO 8601)')
    .option('--end-window <end>', 'End window timestamp (ISO 8601)')
    .action(async (options) => {
      let { databaseUrl } = options;
      const {
        dbHost,
        dbPort,
        dbName,
        dbUsername,
        dbPassword,
        s3Bucket,
        s3Region,
        awsS3TableArn,
        startWindow,
        endWindow,
      } = options;

      if (!databaseUrl) {
        if (dbHost && dbName && dbUsername && dbPassword) {
          databaseUrl = `postgresql://${encodeURIComponent(dbUsername)}:${encodeURIComponent(dbPassword)}@${dbHost}:${dbPort}/${dbName}`;
        } else {
          console.error(
            'Missing required database configuration. Provide either --database-url OR all of --db-host, --db-name, --db-username, --db-password'
          );
          process.exit(1);
        }
      }

      if (!s3Bucket && !awsS3TableArn) {
        console.error('Missing required option: --s3-bucket or --aws-s3-table-arn');
        process.exit(1);
      }

      if (!startWindow || !endWindow) {
        console.error('Missing required options: --start-window and --end-window');
        process.exit(1);
      }

      try {
        await exportData({
          databaseUrl,
          s3Bucket,
          s3Region,
          startWindow,
          endWindow,
          awsS3TableArn,
        });
        console.log('Export completed successfully');
      } catch (err) {
        console.error('Export failed:', err);
        process.exit(1);
      }
    });

  program
    .command('download')
    .description('Download raw parquet files from an AWS S3 Table')
    .requiredOption('-a, --aws-s3-table-arn <arn>', 'AWS S3 Table ARN', process.env.AWS_S3_TABLE_ARN)
    .option('-r, --s3-region <region>', 'S3 Region', process.env.AWS_REGION || 'us-east-1')
    .option('-n, --namespace <namespace>', 'Iceberg namespace', 'default')
    .option('-t, --table <table>', 'Iceberg table name', 'audit_events')
    .option('-o, --output-dir <path>', 'Output directory', 'parquet-download')
    .action(async (options) => {
      const { awsS3TableArn, s3Region, namespace, table, outputDir } = options;

      try {
        const count = await downloadParquetFiles({
          awsS3TableArn,
          s3Region,
          namespace,
          table,
          outputDir,
        });

        if (count === 0) {
          console.log('No Parquet files found for the selected table');
        } else {
          console.log(`Downloaded ${count} Parquet file(s)`);
        }
      } catch (err) {
        console.error('Download failed:', err);
        process.exit(1);
      }
    });

  await program.parseAsync(args);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
