import { BundleEntry } from '@medplum/fhirtypes';
import { Command } from 'commander';
import { createReadStream, writeFile } from 'fs';
import { resolve } from 'path';
import { createInterface } from 'readline';
import { medplum } from '.';
import { prettyPrint } from './utils';

export const bulk = new Command('bulk');

bulk
  .command('export')
  .option(
    '-e, --exportLevel <exportLevel>',
    'Optional export level. Defaults to system level export. "Group/:id" - Group of Patients, "Patient" - All Patients.'
  )
  .option('-t, --types <types>', 'optional resource types to export')
  .option(
    '-s, --since <since>',
    'optional Resources will be included in the response if their state has changed after the supplied time (e.g. if Resource.meta.lastUpdated is later than the supplied _since time).'
  )
  .action(async ({ exportLevel, types, since }) => {
    const response = await medplum.bulkExport(exportLevel, types, since);
    response.output?.forEach(async ({ type, url }) => {
      const data = await medplum.download(url as string);
      const fileName = `${type}.ndjson`;
      writeFile(`${fileName}`, await data.text(), () => {
        console.log(`${fileName} is created`);
      });
    });
  });

bulk
  .command('import')
  .argument('<filename>', 'File Name')
  .action(async (fileName) => {
    const path = resolve(process.cwd(), fileName);
    const batchEntries = [] as BundleEntry[];
    const fileStream = createReadStream(path);
    const rl = createInterface({
      input: fileStream,
    });

    for await (const line of rl) {
      const resource = JSON.parse(line);
      batchEntries.push({
        resource: resource,
        request: {
          method: 'POST',
          url: resource.resourceType,
        },
      });
    }

    const result = await medplum.executeBatch({
      resourceType: 'Bundle',
      type: 'transaction',
      entry: batchEntries,
    });
    prettyPrint(result);
  });
