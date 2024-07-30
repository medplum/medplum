import { Button } from '@mantine/core';
import { capitalize, getReferenceString, MedplumClient } from '@medplum/core';
import { Binary, Bot, Bundle, BundleEntry, Practitioner } from '@medplum/fhirtypes';
import { Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import exampleBotData from '../../data/example-bots.json';

type UploadFunction =
  | ((medplum: MedplumClient, profile: Practitioner) => Promise<void>)
  | ((medplum: MedplumClient) => Promise<void>);

export function UploadDataPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const [buttonDisabled, setButtonDisabled] = useState<boolean>(false);

  const { dataType } = useParams();
  const dataTypeDisplay = dataType ? capitalize(dataType) : '';

  const handleUpload = useCallback(() => {
    setButtonDisabled(true);
    let uploadFunction: UploadFunction;
    switch (dataType) {
      case 'bots':
        uploadFunction = uploadExampleBots;
        break;
      default:
        throw new Error('Invalid upload type');
    }

    uploadFunction(medplum, profile as Practitioner)
      .then(() => navigate('/'))
      .catch(console.error);
  }, [medplum, profile, dataType, navigate]);

  return (
    <Document>
      <Button disabled={buttonDisabled} onClick={handleUpload}>
        Upload {dataTypeDisplay} Data
      </Button>
    </Document>
  );
}

async function uploadExampleBots(medplum: MedplumClient, profile: Practitioner): Promise<void> {
  let transactionString = JSON.stringify(exampleBotData);
  const botEntries: BundleEntry[] =
    (exampleBotData as Bundle).entry?.filter((e) => e.resource?.resourceType === 'Bot') || [];
  const botNames = botEntries.map((e) => (e.resource as Bot).name ?? '');
  const botIds: Record<string, string> = {};

  for (const botName of botNames) {
    let existingBot = await medplum.searchOne('Bot', { name: botName });
    if (!existingBot) {
      const projectId = profile.meta?.project;
      const createBotUrl = new URL('admin/projects/' + (projectId as string) + '/bot', medplum.getBaseUrl());
      existingBot = (await medplum.post(createBotUrl, {
        name: botName,
      })) as Bot;
    }

    botIds[botName] = existingBot.id as string;

    transactionString = transactionString
      .replaceAll(`$bot-${botName}-reference`, getReferenceString(existingBot))
      .replaceAll(`$bot-${botName}-id`, existingBot.id as string);
  }

  const transaction = JSON.parse(transactionString);
  await medplum.executeBatch(transaction);

  // Deploy the new bots
  for (const entry of botEntries) {
    const botName = (entry?.resource as Bot)?.name as string;
    const distUrl = (entry.resource as Bot).executableCode?.url;
    const distBinaryEntry = (exampleBotData as Bundle).entry?.find((e) => e.fullUrl === distUrl);
    // Decode the base64 encoded code and deploy
    const code = atob((distBinaryEntry?.resource as Binary).data as string);
    await medplum.post(medplum.fhirUrl('Bot', botIds[botName], '$deploy'), { code });
  }
}
