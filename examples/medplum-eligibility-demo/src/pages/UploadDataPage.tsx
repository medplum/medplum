// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, LoadingOverlay } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { capitalize, getReferenceString, normalizeErrorString } from '@medplum/core';
import type { MedplumClient, WithId } from '@medplum/core';
import type { Binary, Bot, Bundle, BundleEntry, Practitioner } from '@medplum/fhirtypes';
import { Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import coreData from '../../data/core/core-data.json';
import exampleData from '../../data/example/example-data.json';

type UploadFunction =
  | ((medplum: MedplumClient, profile: Practitioner) => Promise<void>)
  | ((medplum: MedplumClient) => Promise<void>);

export function UploadDataPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const { dataType } = useParams();
  const navigate = useNavigate();
  const dataTypeDisplay = dataType ? capitalize(dataType) : '';
  const [pageDisabled, setPageDisabled] = useState<boolean>(false);

  const handleDataUpload = useCallback((): void => {
    setPageDisabled(true);
    let uploadFunction: UploadFunction;
    switch (dataType) {
      case 'core':
        uploadFunction = uploadCoreData;
        break;
      case 'example':
        uploadFunction = uploadExampleData;
        break;
      case 'bots':
        uploadFunction = uploadExampleBots;
        break;
      default:
        throw new Error(`Invalid upload type: ${dataType}`);
    }

    uploadFunction(medplum, profile as Practitioner)
      .then(() => navigate('/'))
      .catch((error) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(error),
        });
      });
  }, [medplum, profile, dataType, navigate]);

  return (
    <Document>
      <LoadingOverlay visible={pageDisabled} />
      <Button onClick={handleDataUpload}>{`Upload ${dataTypeDisplay} Data`}</Button>
    </Document>
  );
}

async function uploadCoreData(medplum: MedplumClient): Promise<void> {
  await medplum.executeBatch(coreData as Bundle);
  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Core data uploaded',
  });
}

async function uploadExampleData(medplum: MedplumClient): Promise<void> {
  await medplum.executeBatch(exampleData as Bundle);
  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Example data uploaded',
  });
}

const EXAMPLE_BOTS_JSON = '../../data/example/example-bots.json';

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
    // Create a new bot if one doesn't already exist
    if (!existingBot) {
      const projectId = profile.meta?.project;
      const createBotUrl = new URL('admin/projects/' + (projectId as string) + '/bot', medplum.getBaseUrl());
      existingBot = (await medplum.post(createBotUrl, {
        name: botName,
      })) as WithId<Bot>;
    }

    botIds[botName] = existingBot.id as string;

    // Replace the bot id placeholder in the bundle
    transactionString = transactionString
      .replaceAll(`$bot-${botName}-reference`, getReferenceString(existingBot))
      .replaceAll(`$bot-${botName}-id`, existingBot.id as string);
  }

  // Execute the transaction to upload/update the bot
  const transaction = JSON.parse(transactionString);
  await medplum.executeBatch(transaction);

  // Deploy the new bots
  for (const entry of botEntries) {
    const botName = (entry?.resource as Bot)?.name as string;
    const distUrl = (entry?.resource as Bot).executableCode?.url;
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

  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Example bots deployed',
  });
}
