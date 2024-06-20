import { ContentType } from '@medplum/core';
import { Bot, Bundle, BundleEntry, Subscription } from '@medplum/fhirtypes';
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
      const botIdPlaceholder = `$bot-${botName}-id`;
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
            reason: botName,
            channel: { endpoint: botUrlPlaceholder, type: 'rest-hook' },
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
    fullUrl: 'urn:uuid:' + UUIDs.pop(),
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
    fullUrl: 'urn:uuid:' + UUIDs.pop(),
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

const UUIDs = [
  '1e816573-1e13-46d4-ae02-857ac10169e6',
  'b56f4407-800c-411f-bb7b-07f8c73730bf',
  '09ba8367-1cf0-48b4-8965-59e494102af6',
  '5ba14170-42b1-436d-9d46-9a566d534c8f',
  '61750884-cf29-4690-84c6-1bcf5ad14b7e',
  '73693d07-2ba1-4ddd-a6ee-9ea0b2d5aa9c',
  '0ab3ff6c-7c38-4911-a49e-6e8e8fe379e6',
  '4b1851e6-3ced-4f83-ad52-edb85408a1a6',
  '2bf1d4a3-143d-4cbb-bf50-033805791b6d',
  'f3f2aeb8-43ac-49f9-a921-f7fba79348f7',
  'b5ffcef0-2f02-4c96-800b-b86eadc5423e',
  '58019283-e86b-48b2-8aec-5bf0a9fe58f2',
  'a97b0a11-3e9f-42cd-af63-c33a736145b8',
  '067a72c8-f24a-44c1-8145-cc6aa3049037',
  'e038a143-8c66-4b27-b69c-5430aeff6053',
  '146feddc-7915-4ab3-800d-c98e312116cd',
];

main().catch(console.error);
