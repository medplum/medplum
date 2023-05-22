import { Command } from 'commander';
import { writeFile } from 'fs';
import { medplum } from '.';

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
      writeFile(`${type}.json`, await data.text(), () => {
        console.log(`${type}.json is created`);
      });
    });
  });
