// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { capitalize, getReferenceString, isOk, MedplumClient, WithId } from '@medplum/core';
import { Binary, Bot, Bundle, BundleEntry, Practitioner } from '@medplum/fhirtypes';
import { Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck } from '@tabler/icons-react';
import { JSX, useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import exampleBotData from '../../data/example-bots.json';
import formularyData from '../../data/example-data.json';

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
      case 'formulary':
        uploadFunction = uploadExampleFormulary;
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
      <Button disabled={buttonDisabled} loading={buttonDisabled} onClick={handleUpload}>
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
      })) as WithId<Bot>;
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

async function uploadExampleFormulary(medplum: MedplumClient): Promise<void> {
  const batch = formularyData as Bundle;
  const result = await medplum.executeBatch(batch);

  notifications.show({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Uploaded Formulary',
  });

  if (result.entry?.every((entry) => entry.response?.outcome && isOk(entry.response?.outcome))) {
    await setTimeout(
      () =>
        notifications.show({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Uploaded Formulary',
        }),
      1000
    );
  } else {
    throw new Error('Error uploading formulary');
  }
}
