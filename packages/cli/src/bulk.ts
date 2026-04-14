// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { EMPTY } from '@medplum/core';
import type { BundleEntry, ExplanationOfBenefit, ExplanationOfBenefitItem, Resource } from '@medplum/fhirtypes';
import { createReadStream, createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { createMedplumClient } from './util/client';
import { MedplumCommand, addSubcommand, getUnsupportedExtension, prettyPrint } from './utils';

const bulkExportCommand = new MedplumCommand('export');
const bulkImportCommand = new MedplumCommand('import');

export const bulk = new MedplumCommand('bulk');
addSubcommand(bulk, bulkExportCommand);
addSubcommand(bulk, bulkImportCommand);

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
  .option(
    '-d, --target-directory <targetDirectory>',
    'optional target directory to save files from the bulk export operations.'
  )
  .action(async (options) => {
    const { exportLevel, types, since, targetDirectory } = options;
    const medplum = await createMedplumClient(options);
    const response = await medplum.bulkExport(exportLevel, types, since, { pollStatusOnAccepted: true });

    for (const { type, url } of response.output ?? []) {
      const fileUrl = new URL(url);
      const fileName = `${type}_${fileUrl.pathname}`.replaceAll(/[^a-zA-Z0-9]+/g, '_') + '.ndjson';
      const path = resolve(targetDirectory ?? '', fileName);

      const res = await medplum.downloadResponse(url);
      if (!res.ok) {
        throw new Error(`Download failed: ${res.status} ${res.statusText}`);
      }
      if (!res.body) {
        throw new Error('Download response missing body');
      }

      const nodeStream = Readable.fromWeb(res.body as ReadableStream<Uint8Array>);
      await pipeline(nodeStream, createWriteStream(path));
      console.log(`${path} is created`);
    }
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
  .option('-d, --target-directory <targetDirectory>', 'optional target directory of file to be imported')
  .action(async (fileName, options) => {
    const { numResourcesPerRequest, addExtensionsForMissingValues, targetDirectory } = options;
    const path = resolve(targetDirectory ?? process.cwd(), fileName);
    const medplum = await createMedplumClient(options);

    await importFile(path, Number.parseInt(numResourcesPerRequest, 10), medplum, addExtensionsForMissingValues);
  });

async function importFile(
  path: string,
  numResourcesPerRequest: number,
  medplum: MedplumClient,
  addExtensionsForMissingValues: boolean
): Promise<void> {
  let entries: BundleEntry[] = [];
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

  for (const resultEntry of result.entry ?? EMPTY) {
    prettyPrint(resultEntry.response);
  }
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
    resource.provider = getUnsupportedExtension();
  }

  resource.item?.forEach((item: ExplanationOfBenefitItem) => {
    if (!item?.productOrService) {
      item.productOrService = getUnsupportedExtension();
    }
  });

  return resource;
}
