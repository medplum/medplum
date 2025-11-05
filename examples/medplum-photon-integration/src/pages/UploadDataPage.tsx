// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { capitalize, getReferenceString, isOk } from '@medplum/core';
import type { MedplumClient, WithId } from '@medplum/core';
import type { Binary, Bot, Bundle, BundleEntry, Practitioner } from '@medplum/fhirtypes';
import { Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
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

const EXAMPLE_BOTS_JSON = '../../data/example-bots.json';

async function uploadExampleBots(medplum: MedplumClient, profile: Practitioner): Promise<void> {
  let exampleBotData: Bundle;
  try {
    exampleBotData = await import(/* @vite-ignore */ EXAMPLE_BOTS_JSON);
  } catch (err) {
    console.log(err);
    if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
      throw new Error('Error loading bot data. Run `npm run build:bots` and try again.');
    }
    throw err;
  }
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
    const distBinaryEntry = exampleBotData.entry?.find((e: any) => e.fullUrl === distUrl) as
      | BundleEntry<Binary>
      | undefined;
    if (!distBinaryEntry) {
      throw new Error('Error finding Bundle entry with fullUrl: ' + distUrl);
    }
    if (!distBinaryEntry.resource?.data) {
      throw new Error('Could not find encoded code for bot: ' + botName);
    }
    // Decode the base64 encoded code and deploy
    const code = atob(distBinaryEntry.resource.data);
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
