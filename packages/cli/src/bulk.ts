import { Bundle, BundleEntry, Resource } from '@medplum/fhirtypes';
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
    let batchEntries = [] as BundleEntry[];
    const fileStream = createReadStream(path);
    const rl = createInterface({
      input: fileStream,
    });
    let byte = 0;
    let importTotal = 0;
    let importByteTotal = 0;
    let resourceIds = [];

    for await (const line of rl) {
      byte += line.length;
      const resource = JSON.parse(line);

      resourceIds.push({ id: resource.id, type: resource.resouceType });
      batchEntries.push({
        resource: resource,
        request: {
          method: 'POST',
          url: resource.resourceType,
        },
      });
      if (byte >= 500000) {
        importTotal += batchEntries.length;
        importByteTotal += byte;
        // console.log('sending', importTotal, byte, importByteTotal);

        try {
          const result = await sendBatchEntries(batchEntries);

          result.entry?.forEach((resultEntry) => {
            prettyPrint(resultEntry.response);
          });
          prettyPrint({
            addedResources: resourceIds,
            byte,
            count: batchEntries.length,
            importTotal,
            importByteTotal,
          });
        } catch (err) {
          console.log('something happened');
          break;
        }

        byte = 0;
        batchEntries = [];
        resourceIds = [];
      }
    }

    if (batchEntries.length > 0) {
      importTotal += batchEntries.length;
      importByteTotal += byte;
      const result = await sendBatchEntries(batchEntries);
      result.entry?.forEach((resultEntry) => {
        prettyPrint(resultEntry.response);
      });
      prettyPrint({
        addedResources: resourceIds,
        byte,
        count: batchEntries.length,
        importTotal,
        importByteTotal,
      });
    }
  });

async function sendBatchEntries(batchEntries: BundleEntry[]): Promise<Bundle<Resource>> {
  return await medplum.executeBatch({
    resourceType: 'Bundle',
    type: 'transaction',
    entry: batchEntries,
  });
}
