import { getReferenceString, MedplumClient, resolveId, WithId } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { readFileSync } from 'fs';
import { Command } from 'commander';
import path from 'path';

// Define the fetch-patients bpt
const CONNECTOR_BOT = {
  identifier: [{ system: 'https://www.medplum.com', value: 'medplum-healthie-connector/fetch-patients' }],
  name: 'Medplum Healthie Connector: Fetch Patients',
  description: 'Connector to fetch patients from Healthie',
  sourceCode: { url: 'src/fetch-patients.ts' },
  executableCode: { url: 'dist/fetch-patients.js' },
} satisfies Partial<Bot>;

async function main(): Promise<void> {
  console.log('Installing Healthie connector bot...');

  // Parse command line arguments
  const program = new Command();
  program
    .name('deploy-connector')
    .description('Deploy Healthie connector bot to Medplum')
    .argument('<clientId>', 'Medplum client ID')
    .argument('<clientSecret>', 'Medplum client secret')
    .option('-u, --base-url <baseUrl>', 'Medplum base URL', 'https://api.medplum.com/')
    .parse();

  const [clientId, clientSecret] = program.args;
  const options = program.opts();

  const deployOptions: DeployOptions = {
    clientId,
    clientSecret,
    baseUrl: options.baseUrl,
  };

  const medplum = await connectToMedplum(deployOptions);
  await deployConnectorBot(medplum);
}

/**
 * Creates a bot if it doesn't already exist in the Medplum project.
 *
 * @param medplum - The Medplum client instance
 * @returns Promise resolving to the bot resource with ID
 */
async function createOrUpdateBot(medplum: MedplumClient): Promise<WithId<Bot>> {
  // Get the current project from the active login
  const project = medplum.getActiveLogin()?.project;
  if (!project) {
    throw new Error('No project found');
  }

  // Resolve the project ID from the project reference
  const projectId = resolveId(project) as string;

  // Extract source code and executable code files from CONNECTOR_BOT
  // Note: botFields should be CONNECTOR_BOT based on the context
  const { sourceCode: sourceCodeFile, executableCode: executableCodeFile, ...otherFields } = CONNECTOR_BOT;
  if (!sourceCodeFile?.url || !executableCodeFile?.url) {
    throw new Error('Source code and executable code URL is required');
  }

  // Check if a bot with the same identifier already exists
  let existing = await medplum.searchOne('Bot', {
    identifier: `${CONNECTOR_BOT.identifier?.[0].system}|${CONNECTOR_BOT.identifier?.[0].value}`,
  });

  // Create attachments for source code and executable code
  const sourceCode = await medplum.createAttachment({
    data: readFileSync(sourceCodeFile.url, 'utf8'),
    contentType: 'text/typescript',
  });
  const executableCode = await medplum.createAttachment({
    data: readFileSync(executableCodeFile.url, 'utf8'),
    contentType: 'application/javascript',
  });

  // If bot already exists, return it without creating a new one
  if (!existing) {
    console.log('No existing connector found. Creating...');
    // Create the bot resource in the project
    existing = await medplum
      .post('admin/projects/' + projectId + '/bot', {
        name: CONNECTOR_BOT.name,
        description: CONNECTOR_BOT.description,
        sourceCode,
        executableCode,
      })
      .then((response) => {
        if (response.resourceType !== 'Bot') {
          throw new Error('Error Creating Bot: ' + response);
        }
        return response as WithId<Bot>;
      })
      .catch((e) => {
        throw new Error(e);
      });
    console.log(`Successfully created Bot/${existing.id}`);
  } else {
    console.log(`Found existing Bot/${existing.id}`);
  }

  // Update the bot with additional fields and runAsUser flag
  return medplum.updateResource<Bot>({
    ...existing,
    ...otherFields,
    sourceCode,
    executableCode,
    runAsUser: true,
  });
}

async function deployConnectorBot(medplum: MedplumClient): Promise<void> {
  const bot = await createOrUpdateBot(medplum);
  console.log('Deploying bot', bot.name, getReferenceString(bot));

  const id = bot.id;

  const codeFilename = CONNECTOR_BOT.executableCode.url.replace('file://', '');
  const code = readFileSync(codeFilename, 'utf8');
  await medplum.post(medplum.fhirUrl('Bot', id, '$deploy'), { code, filename: path.basename(codeFilename) });
}

interface DeployOptions {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

async function connectToMedplum(options: DeployOptions): Promise<MedplumClient> {
  const medplum = new MedplumClient({
    baseUrl: options.baseUrl,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
  });
  await medplum.startClientLogin(options.clientId, options.clientSecret);
  return medplum;
}

main().catch(console.error);
