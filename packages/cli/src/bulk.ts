import { BundleEntry } from '@medplum/fhirtypes';
import { Command } from 'commander';
import { createReadStream, writeFile } from 'fs';
import { resolve } from 'path';
import { createInterface } from 'readline';
import { medplum } from '.';
import { getMedplumClient, prettyPrint } from './utils';

export const bulk = new Command('bulk');

bulk
  .command('export')
  .option(
    '-e, --export-level <exportLevel>',
    'Optional export level. Defaults to system level export. "Group/:id" - Group of Patients, "Patient" - All Patients.'
  )
  .option('-t, --types <types>', 'optional resource types to export')
  .option(
    '-s, --since <since>',
    'optional Resources will be included in the response if their state has changed after the supplied time (e.g. if Resource.meta.lastUpdated is later than the supplied _since time).'
  )
  .action(async (options) => {
    const { exportLevel, types, since } = options;
    const medplum = await getMedplumClient(options);
    const response = await medplum.bulkExport(exportLevel, types, since);
    response.output?.forEach(async ({ type, url }) => {
      const fileUrl = new URL(url as string);
      const data = await medplum.download(url as string);
      const fileName = `${type}_${fileUrl.pathname}`.replace(/[^a-zA-Z0-9]+/g, '_') + '.ndjson';

      writeFile(`${fileName}`, await data.text(), () => {
        console.log(`${fileName} is created`);
      });
    });
  });

bulk
  .command('import')
  .argument('<filename>', 'File Name')
  .option(
    '--num-resources-per-request <numResourcesPerRequest>',
    'optional number of resources to import per batch request. Defaults to 25.',
    '25'
  )
  .action(async (fileName, options) => {
    const path = resolve(process.cwd(), fileName);
    const { numResourcesPerRequest } = options;

    await importFile(path, parseInt(numResourcesPerRequest));
  });

async function importFile(path: string, numResourcesPerRequest: number): Promise<void> {
  let entries = [] as BundleEntry[];
  const fileStream = createReadStream(path);
  const rl = createInterface({
    input: fileStream,
  });

  for await (const line of rl) {
    const resource = JSON.parse(line);
    entries.push({
      resource: resource,
      request: {
        method: 'POST',
        url: resource.resourceType,
      },
    });
    if (entries.length % numResourcesPerRequest === 0) {
      await sendBatchEntries(entries);
      entries = [];
    }
  }
  if (entries.length > 0) {
    await sendBatchEntries(entries);
  }
}

async function sendBatchEntries(entries: BundleEntry[]): Promise<void> {
  const result = await medplum.executeBatch({
    resourceType: 'Bundle',
    type: 'transaction',
    entry: entries,
  });

  result.entry?.forEach((resultEntry) => {
    prettyPrint(resultEntry.response);
  });
}
