import { ContentType } from '@medplum/core';
import { Bot, Bundle, BundleEntry, Subscription } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

interface BotDescription {
  src: string;
  dist: string;
  criteria?: string;
}
const Bots: BotDescription[] = [
  {
    src: 'src/bots/example/create-review-report-task.ts',
    dist: 'dist/example/create-review-report-task.js',
    criteria: 'DiagnosticReport',
  },
  {
    src: 'src/bots/example/create-respond-to-message-task.ts',
    dist: 'dist/example/create-respond-to-message-task.js',
    criteria: 'Communication?part-of:missing=true',
  },
];

async function main(): Promise<void> {
  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: Bots.flatMap((botDescription): BundleEntry[] => {
      const botName = path.parse(botDescription.src).name;
      const botUrlPlaceholder = `$bot-${botName}-reference`;
      const results: BundleEntry[] = [];
      const { srcEntry, distEntry } = readBotFiles(botDescription);
      results.push(srcEntry, distEntry);

      results.push({
        request: {
          url: botUrlPlaceholder,
          method: 'PUT',
        },
        resource: {
          resourceType: 'Bot',
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
        } as Bot,
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
            channel: { endpoint: botUrlPlaceholder },
            criteria: botDescription.criteria,
          } as Subscription,
        });
      }

      return results;
    }),
  };

  fs.writeFileSync('data/example/example-bots.json', JSON.stringify(bundle, null, 2));
}

function readBotFiles(description: BotDescription): Record<string, BundleEntry> {
  const sourceFile = fs.readFileSync(description.src);
  const distFile = fs.readFileSync(description.dist);

  const srcEntry: BundleEntry = {
    fullUrl: 'urn:uuid:' + randomUUID(),
    request: {
      method: 'POST',
      url: 'Binary',
    },
    resource: {
      resourceType: 'Binary',
      contentType: ContentType.TYPESCRIPT,
      data: sourceFile.toString('base64'),
    },
  };
  const distEntry: BundleEntry = {
    fullUrl: 'urn:uuid:' + randomUUID(),
    request: {
      method: 'POST',
      url: 'Binary',
    },
    resource: {
      resourceType: 'Binary',
      contentType: ContentType.JAVASCRIPT,
      data: distFile.toString('base64'),
    },
  };
  return { srcEntry, distEntry };
}

main().catch(console.error);
