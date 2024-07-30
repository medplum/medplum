import { Bundle, BundleEntry } from '@medplum/fhirtypes';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { ContentType } from '@medplum/core';

interface BotDescription {
  src: string;
  dist: string;
  criteria?: string;
}

const Bots: BotDescription[] = [
  {
    src: 'src/bots/test-auth.ts',
    dist: 'dist/test-auth.js',
  },
  {
    src: 'src/bots/sync-patient.ts',
    dist: 'dist/sync-patient.js',
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
        fullUrl: 'urn:uuid:' + randomUUID(),
        request: { method: 'PUT', url: botUrlPlaceholder },
        resource: {
          resourceType: 'Bot',
          id: botIdPlaceholder,
          identifier: [
            {
              system: 'https://neutron.health/bots',
              value: botName,
            },
          ],
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
            method: 'POST',
            url: 'Subscription',
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

  fs.writeFileSync('data/example-bots.json', JSON.stringify(bundle, null, 2));
}

function readBotFiles(description: BotDescription): Record<string, BundleEntry> {
  const sourceFile = fs.readFileSync(description.src);
  const distFile = fs.readFileSync(description.dist);

  const srcEntry: BundleEntry = {
    fullUrl: 'urn:uuid:' + randomUUID(),
    request: { method: 'POST', url: 'Binary' },
    resource: {
      resourceType: 'Binary',
      contentType: ContentType.TYPESCRIPT,
      data: sourceFile.toString('base64'),
    },
  };

  const distEntry: BundleEntry = {
    fullUrl: 'urn:uuid:' + randomUUID(),
    request: { method: 'POST', url: 'Binary' },
    resource: {
      resourceType: 'Binary',
      contentType: ContentType.JAVASCRIPT,
      data: distFile.toString('base64'),
    },
  };

  return { srcEntry, distEntry };
}

main().catch(console.error);
