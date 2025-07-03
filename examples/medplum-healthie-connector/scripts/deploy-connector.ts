import { getReferenceString, MedplumClient, resolveId, WithId } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { readFileSync } from 'fs';

async function main(): Promise<void> {
  console.log('Installing Healthie connector bot...');

  // Get command line arguments
  const medplum = connectToMedplum();
  const project = medplum.getActiveLogin()?.project;
  if (!project) {
    throw new Error('No project found');
  }
  const projectId = resolveId(project) as string;

  // Define the fetch-patients bot
  const botFields: Partial<Bot> = {
    identifier: [{ system: 'https://www.medplum.com', value: 'medplum-healthie-connector/fetch-patients' }],
    name: 'Medplum Healthie Connector: Fetch Patients',
    description: 'Connector to fetch patients from Healthie',
    sourceCode: { url: 'src/fetch-patients.ts' },
    executableCode: { url: 'dist/fetch-patients.js' },
  };

  const bot = await createBotIfNotExists(medplum, projectId, botFields);
  console.log('Deploying bot', bot.name, getReferenceString(bot));
  await deployBot(medplum, bot, 'fetch-patients');
}

async function createBotIfNotExists(
  medplum: MedplumClient,
  projectId: string,
  botFields: Partial<Bot>
): Promise<WithId<Bot>> {
  const { sourceCode: sourceCodeFile, executableCode: executableCodeFile, ...otherFields } = botFields;
  if (!sourceCodeFile?.url || !executableCodeFile?.url) {
    throw new Error('Source code and executable code URL is required');
  }

  const existing = await medplum.searchOne('Bot', {
    identifier: `${botFields.identifier?.[0].system}|${botFields.identifier?.[0].value}`,
  });

  if (existing) {
    return existing;
  }

  const sourceCode = await medplum.createAttachment({
    data: readFileSync(sourceCodeFile.url, 'utf8'),
    contentType: 'text/typescript',
  });
  const executableCode = await medplum.createAttachment({
    data: readFileSync(executableCodeFile.url, 'utf8'),
    contentType: 'application/javascript',
  });

  const result = await medplum.post('admin/projects/' + projectId + '/bot', {
    name: botFields.name,
    description: botFields.description,
    sourceCode,
    executableCode,
  });
  return medplum.updateResource({
    ...result,
    ...otherFields,
    sourceCode,
    executableCode,
    runAsUser: true,
  });
}

async function deployBot(medplum: MedplumClient, bot: WithId<Bot>, baseFilename: string): Promise<void> {
  const id = bot.id;

  const code = readFileSync(`dist/${baseFilename}.js`, 'utf8');
  const filename = `${baseFilename}.js`;
  await medplum.post(medplum.fhirUrl('Bot', id, '$deploy'), { code, filename });
}

function connectToMedplum(): MedplumClient {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error('Usage: ts-node deploy-connector.ts <PROJECT_ID> <CLIENT_ID> <CLIENT_SECRET> [<BASE_URL>]');
    process.exit(1);
  }

  // Configuration from command line arguments
  const BASE_URL = 'https://api.medplum.com/';
  const CLIENT_ID = args[1];
  const CLIENT_SECRET = args[2];

  const medplum = new MedplumClient({
    baseUrl: BASE_URL,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
  });
  return medplum;
}

main().catch(console.error);
