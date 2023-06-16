import { MedplumClient } from '@medplum/core';
import { BundleEntry, ExplanationOfBenefit, ExplanationOfBenefitItem, Extension, Resource } from '@medplum/fhirtypes';
import { Command } from 'commander';
import { createReadStream, writeFile } from 'fs';
import { resolve } from 'path';
import { createInterface } from 'readline';
import { createMedplumClient } from './util/client';
import { createMedplumCommand } from './util/command';
import { prettyPrint } from './utils';

const bulkExportCommand = createMedplumCommand('export');
const bulkImportCommand = createMedplumCommand('import');

export const bulk = new Command('bulk').addCommand(bulkExportCommand).addCommand(bulkImportCommand);

bulkExportCommand
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
    const medplum = await createMedplumClient(options);
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

bulkImportCommand
  .argument('<filename>', 'File Name')
  .option(
    '--num-resources-per-request <numResourcesPerRequest>',
    'optional number of resources to import per batch request. Defaults to 25.',
    '25'
  )
  .option(
    '--add-extensions-for-missing-values',
    'optional flag to add extensions for missing values in a resource',
    false
  )
  .action(async (fileName, options) => {
    const path = resolve(process.cwd(), fileName);
    const { numResourcesPerRequest, addExtensionsForMissingValues } = options;
    const medplum = await createMedplumClient(options);
    console.log(options);
    await importFile(path, parseInt(numResourcesPerRequest), medplum, addExtensionsForMissingValues);
  });

async function importFile(
  path: string,
  numResourcesPerRequest: number,
  medplum: MedplumClient,
  addExtensionsForMissingValues: boolean
): Promise<void> {
  let entries = [] as BundleEntry[];
  const fileStream = createReadStream(path);
  const rl = createInterface({
    input: fileStream,
  });

  for await (const line of rl) {
    const resource = parseResource(line, addExtensionsForMissingValues);

    entries.push({
      resource: resource,
      request: {
        method: 'POST',
        url: resource.resourceType,
      },
    });
    if (entries.length % numResourcesPerRequest === 0) {
      await sendBatchEntries(entries, medplum);
      entries = [];
    }
  }
  if (entries.length > 0) {
    await sendBatchEntries(entries, medplum);
  }
}

async function sendBatchEntries(entries: BundleEntry[], medplum: MedplumClient): Promise<void> {
  const result = await medplum.executeBatch({
    resourceType: 'Bundle',
    type: 'transaction',
    entry: entries,
  });

  result.entry?.forEach((resultEntry) => {
    prettyPrint(resultEntry.response);
  });
}

function parseResource(jsonString: string, addExtensionsForMissingValues: boolean): Resource {
  const resource = JSON.parse(jsonString);

  if (addExtensionsForMissingValues) {
    return addExtensionsForMissingValuesResource(resource);
  }

  return resource;
}

function addExtensionsForMissingValuesResource(resource: Resource): Resource {
  if (resource.resourceType === 'ExplanationOfBenefit') {
    return addExtensionsForMissingValuesExplanationOfBenefits(resource);
  }
  return resource;
}

function addExtensionsForMissingValuesExplanationOfBenefits(resource: ExplanationOfBenefit): ExplanationOfBenefit {
  if (!resource.provider) {
    resource.provider = getUnmappedExtension();
  }

  resource.item?.forEach((item: ExplanationOfBenefitItem) => {
    if (!item?.productOrService) {
      item.productOrService = getUnmappedExtension();
    }
  });

  return resource;
}

function getUnmappedExtension(): Extension {
  return {
    extension: [
      {
        url: 'https://g.co/unmapped-by-bcda',
        valueString: 'This is a required FHIR R4 Field, but not mapped by BCDA, which is why we expect it to be empty.',
      },
    ],
  };
}
