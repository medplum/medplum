// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, LoadingOverlay } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { capitalize, createReference, getReferenceString, isOk, normalizeErrorString } from '@medplum/core';
import type { MedplumClient, WithId } from '@medplum/core';
import type { Binary, Bot, Bundle, BundleEntry, Coding, Practitioner, ValueSet } from '@medplum/fhirtypes';
import { Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import businessStatusValueSet from '../../data/core/business-status-valueset.json';
import practitionerRoleValueSet from '../../data/core/practitioner-role-valueset.json';
import taskTypeValueSet from '../../data/core/task-type-valueset.json';
import exampleMessageData from '../../data/example/example-messages.json';
import exampleRoleData from '../../data/example/example-practitioner-role.json';
import exampleReportData from '../../data/example/example-reports.json';
import exampleTaskData from '../../data/example/example-tasks.json';

type UploadFunction =
  | ((medplum: MedplumClient, profile: WithId<Practitioner>) => Promise<void>)
  | ((medplum: MedplumClient) => Promise<void>);

export function UploadDataPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const { dataType } = useParams();
  const navigate = useNavigate();
  const [pageDisabled, setPageDisabled] = useState<boolean>(false);

  const dataTypeDisplay = dataType ? capitalize(dataType) : '';

  const handleUpload = useCallback(() => {
    setPageDisabled(true);
    let uploadFunction: UploadFunction;
    switch (dataType) {
      case 'core':
        uploadFunction = uploadCoreData;
        break;
      case 'task':
        uploadFunction = uploadExampleTaskData;
        break;
      case 'role':
        uploadFunction = uploadExampleRoleData;
        break;
      case 'message':
        uploadFunction = uploadExampleMessageData;
        break;
      case 'report':
        uploadFunction = uploadExampleReportData;
        break;
      case 'qualifications':
        uploadFunction = uploadExampleQualifications;
        break;
      case 'bots':
        uploadFunction = uploadExampleBots;
        break;
      default:
        throw new Error(`Invalid upload type '${dataType}'`);
    }

    uploadFunction(medplum, profile as WithId<Practitioner>)
      .then(() => navigate(-1))
      .catch((error) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(error),
        });
      })
      .finally(() => setPageDisabled(false));
  }, [medplum, profile, dataType, navigate]);

  return (
    <Document>
      <LoadingOverlay visible={pageDisabled} />
      <Button disabled={pageDisabled} onClick={handleUpload}>{`Upload ${dataTypeDisplay} Data`}</Button>
    </Document>
  );
}

async function uploadCoreData(medplum: MedplumClient): Promise<void> {
  // Upload all the core ValueSets in a single batch request
  const valueSets: ValueSet[] = [
    businessStatusValueSet as ValueSet,
    taskTypeValueSet as ValueSet,
    practitionerRoleValueSet as ValueSet,
  ];

  // Upsert the ValueSet (see: https://www.medplum.com/docs/fhir-datastore/fhir-batch-requests#performing-upserts)
  const batch: Bundle = {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: valueSets.flatMap((valueSet): BundleEntry[] => {
      const tempId = valueSet.id as string;
      return [
        {
          fullUrl: tempId,
          request: { method: 'POST', url: valueSet.resourceType, ifNoneExist: `url=${valueSet.url}` },
          resource: valueSet,
        },
        {
          request: { method: 'PUT', url: tempId },
          resource: { id: tempId, ...valueSet },
        },
      ];
    }),
  };
  console.log(batch);
  const result = await medplum.executeBatch(batch);
  console.log(result);

  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Uploaded Business Statuses',
  });

  if (result.entry?.every((entry) => entry.response?.outcome && isOk(entry.response?.outcome))) {
    await setTimeout(
      () =>
        showNotification({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Uploaded Business Statuses',
        }),
      1000
    );
  } else {
    throw new Error('Error uploading core data');
  }
}

async function uploadExampleMessageData(medplum: MedplumClient): Promise<void> {
  await medplum.executeBatch(exampleMessageData as Bundle);
  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Uploaded Example Messages',
  });
}

async function uploadExampleReportData(medplum: MedplumClient): Promise<void> {
  await medplum.executeBatch(exampleReportData as Bundle);
  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Uploaded Example Report',
  });
}

async function uploadExampleTaskData(medplum: MedplumClient): Promise<void> {
  await medplum.executeBatch(exampleTaskData as Bundle);
  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Uploaded Example Tasks',
  });
}

async function uploadExampleQualifications(medplum: MedplumClient, profile: Practitioner): Promise<void> {
  if (!profile) {
    return;
  }

  const states: Coding[] = [
    { code: 'NY', display: 'State of New York', system: 'https://www.usps.com/' },
    { code: 'CA', display: 'State of California', system: 'https://www.usps.com/' },
    { code: 'TX', display: 'State of Texas', system: 'https://www.usps.com/' },
  ];

  await medplum.patchResource(profile.resourceType, profile.id as string, [
    {
      path: '/qualification',
      // JSON patch does not have an upsert operation. If the user already has qualifications, we should just replace them with these licences
      op: profile.qualification ? 'replace' : 'add',
      value: states.map((state) => ({
        code: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0360',
              code: 'MD',
            },
          ],
          text: 'MD',
        },
        // Medical License Issuer: State of New York
        issuer: {
          display: state.display,
        },
        // Extension: Medical License Valid in NY
        extension: [
          {
            url: 'http://hl7.org/fhir/us/davinci-pdex-plan-net/StructureDefinition/practitioner-qualification',
            extension: [
              {
                url: 'whereValid',
                valueCodeableConcept: {
                  coding: [state],
                },
              },
            ],
          },
        ],
      })),
    },
  ]);
  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Uploaded Example Qualifications',
  });
}

async function uploadExampleRoleData(medplum: MedplumClient, profile: WithId<Practitioner>): Promise<void> {
  // Update the suffix of the current user to highlight the change
  if (!profile?.name?.[0]?.suffix) {
    await medplum.patchResource(profile.resourceType, profile.id, [
      {
        op: 'add',
        path: '/name/0/suffix',
        value: ['MD'],
      },
    ]);
  }

  const bundleString = JSON.stringify(exampleRoleData, null, 2)
    .replaceAll('$practitionerReference', getReferenceString(profile))
    .replaceAll('"$practitioner"', JSON.stringify(createReference(profile)));

  const transaction = JSON.parse(bundleString) as Bundle;

  // Create the practitioner role
  await medplum.executeBatch(transaction);

  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Uploaded Example Qualifications',
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
  const botEntries: BundleEntry[] = exampleBotData.entry?.filter((e) => e.resource?.resourceType === 'Bot') || [];
  const botNames = botEntries.map((e) => (e.resource as Bot).name ?? '');
  const botIds: Record<string, string> = {};

  for (const botName of botNames) {
    let existingBot = await medplum.searchOne('Bot', { name: botName });
    // Create a new Bot if it doesn't already exist
    if (!existingBot) {
      const projectId = profile.meta?.project;
      const createBotUrl = new URL('admin/projects/' + (projectId as string) + '/bot', medplum.getBaseUrl());
      existingBot = await medplum.post<WithId<Bot>>(createBotUrl, {
        name: botName,
      });
    }

    botIds[botName] = existingBot.id;

    // Replace the Bot id placeholder in the bundle
    transactionString = transactionString
      .replaceAll(`$bot-${botName}-reference`, getReferenceString(existingBot))
      .replaceAll(`$bot-${botName}-id`, existingBot.id);
  }

  // Execute the transaction to upload / update the bot
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

  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Deployed Example Bots',
  });
}
