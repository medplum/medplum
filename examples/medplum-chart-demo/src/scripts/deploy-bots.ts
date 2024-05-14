import { ContentType } from '@medplum/core';
import { Bundle, BundleEntry } from '@medplum/fhirtypes';
import fs from 'fs';
import path from 'path';

interface BotDescription {
  src: string;
  dist: string;
  criteria?: string;
}

const Bots: BotDescription[] = [
  {
    src: 'src/bots/core/general-encounter-note.ts',
    dist: 'dist/core/general-encounter-note.js',
    criteria: 'QuestionnaireResponse?questionnaire=$encounter-note',
  },
  {
    src: 'src/bots/core/obstetric-encounter-note.ts',
    dist: 'dist/core/obstetric-encounter-note.js',
    criteria: 'QuestionnaireResponse?questionnaire=$obstetric-visit',
  },
  {
    src: 'src/bots/core/gynecology-encounter-note.ts',
    dist: 'dist/core/gynecology-encounter-note.js',
    criteria: 'QuestionnaireResponse?questionnaire=$gynecology-visit',
  },
];

async function main(): Promise<void> {
  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: Bots.flatMap((botDescription): BundleEntry[] => {
      const botName = path.parse(botDescription.src).name;
      const botUrlPlaceholder = `$bot-${botName}-reference`;
      const botIdPlaceholder = `$bot-${botName}-id`;
      const results: BundleEntry[] = [];
      const { srcEntry, distEntry } = readBotFiles(botDescription);
      results.push(srcEntry, distEntry);

      results.push({
        request: { method: 'PUT', url: botUrlPlaceholder },
        resource: {
          resourceType: 'Bot',
          id: botIdPlaceholder,
          name: botName,
          runtimeVersion: 'awslambda',
          sourceCode: {
            contentType: ContentType.TYPESCRIPT,
            url: srcEntry.fullUrl,
          },
          executableCode: {
            contentType: ContentType.JAVASCRIPT,
            url: distEntry.fullUrl,
          },
        },
      });

      if (botDescription.criteria) {
        results.push({
          request: {
            url: 'Subscription',
            method: 'POST',
            ifNoneExist: `url=${botUrlPlaceholder}`,
          },
          resource: {
            resourceType: 'Subscription',
            status: 'active',
            reason: botName,
            channel: { endpoint: botUrlPlaceholder, type: 'rest-hook' },
            criteria: botDescription.criteria,
          },
        });
      }

      return results;
    }),
  };

  fs.writeFileSync('data/core/example-bots.json', JSON.stringify(bundle, null, 2));
}

function readBotFiles(description: BotDescription): Record<string, BundleEntry> {
  const sourceFile = fs.readFileSync(description.src);
  const distFile = fs.readFileSync(description.dist);

  const srcEntry: BundleEntry = {
    fullUrl: 'urn:uuid:' + UUIDs.pop(),
    request: { method: 'POST', url: 'Binary' },
    resource: {
      resourceType: 'Binary',
      contentType: ContentType.TYPESCRIPT,
      data: sourceFile.toString('base64'),
    },
  };
  const distEntry: BundleEntry = {
    fullUrl: 'urn:uuid:' + UUIDs.pop(),
    request: { method: 'POST', url: 'Binary' },
    resource: {
      resourceType: 'Binary',
      contentType: ContentType.JAVASCRIPT,
      data: distFile.toString('base64'),
    },
  };

  return { srcEntry, distEntry };
}

const UUIDs = [
  '1d296860-2133-4f42-b661-336b3da71742',
  '84cc24ae-bd57-4579-bfff-8cab8964e351',
  '4a81b923-dd2d-4f3e-ac17-90c535650b4e',
  'eea5c730-3f18-4f11-ab66-c8faea651de9',
  '4b472f90-4d31-43e0-9824-24c7efa2e13c',
  'b48e2cdc-4727-4228-9081-a17045d3e182',
  '7603d179-7e63-4ddd-9152-df37f85bacef',
  '5ed5a825-0fca-40bd-bc7b-c720b55d3681',
  'd954d718-a8d2-4e2e-9c5b-ab9763e9e2bc',
  '0be9ea88-ab72-4404-bdb4-89faa94a9b85',
  '3477307a-fa63-4d7b-a7d5-e1143b37e574',
  '6951d8c7-a5a4-4f54-863a-374683b79ad3',
  '081fb8d1-76dd-4dee-a849-44312b202909',
  '53308e3f-9a6f-49da-be94-04aa3a546759',
  '9ea4744a-69a0-406c-b9eb-c20bba39519a',
  '4e3875dd-be14-4fce-95da-ade8db2aefc1',
];

main().catch(console.error);
