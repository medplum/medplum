import { Button, LoadingOverlay } from '@mantine/core';
import {
  MedplumClient,
  capitalize,
  createReference,
  getReferenceString,
  isOk,
  normalizeErrorString,
} from '@medplum/core';
import { Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { useNavigate, useParams } from 'react-router-dom';

import { showNotification } from '@mantine/notifications';
import { Bot, Bundle, BundleEntry, Coding, Practitioner, ValueSet } from '@medplum/fhirtypes';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import businessStatusValueSet from '../../data/core/business-status-valueset.json';
import practitionerRoleValueSet from '../../data/core/practitioner-role-valueset.json';
import taskTypeValueSet from '../../data/core/task-type-valueset.json';
import exampleBotData from '../../data/example/example-bots.json';
import exampleMessageData from '../../data/example/example-messages.json';
import exampleRoleData from '../../data/example/example-practitioner-role.json';
import exampleReportData from '../../data/example/example-reports.json';
import exampleTaskData from '../../data/example/example-tasks.json';

type UploadFunction =
  | ((medplum: MedplumClient, profile: Practitioner) => Promise<void>)
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

    uploadFunction(medplum, profile as Practitioner)
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
    entry: valueSets.flatMap((valueSet) => {
      const tempId = valueSet.id;
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
      ] as BundleEntry[];
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

async function uploadExampleRoleData(medplum: MedplumClient, profile: Practitioner): Promise<void> {
  // Update the suffix of the current user to highlight the change
  if (!profile?.name?.[0]?.suffix) {
    await medplum.patchResource(profile.resourceType, profile.id as string, [
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

async function uploadExampleBots(medplum: MedplumClient, profile: Practitioner): Promise<void> {
  let transactionString = JSON.stringify(exampleBotData);
  const botEntries: BundleEntry[] =
    (exampleBotData as Bundle).entry?.filter((e) => e.resource?.resourceType === 'Bot') || [];
  const botNames = botEntries.map((e) => (e.resource as Bot).name ?? '');
  const botIds: Record<string, string> = {};

  for (const botName of botNames) {
    let existingBot = await medplum.searchOne('Bot', { name: botName });
    // Create a new Bot if it doesn't already exist
    if (!existingBot) {
      const projectId = profile.meta?.project;
      const createBotUrl = new URL('admin/projects/' + (projectId as string) + '/bot', medplum.getBaseUrl());
      existingBot = (await medplum.post(createBotUrl, {
        name: botName,
      })) as Bot;
    }

    botIds[botName] = existingBot.id as string;

    // Replace the Bot id placeholder in the bundle
    transactionString = transactionString
      .replaceAll(`$bot-${botName}-reference`, getReferenceString(existingBot))
      .replaceAll(`$bot-${botName}-id`, existingBot.id as string);
  }

  // Execute the transaction to upload / update the bot
  const transaction = JSON.parse(transactionString);
  await medplum.executeBatch(transaction);

  // Deploy the new bots
  for (const entry of botEntries) {
    const botName = (entry?.resource as Bot)?.name as string;
    const distUrl = (entry.resource as Bot).executableCode?.url;
    const distBinaryEntry = exampleBotData.entry.find((e) => e.fullUrl === distUrl);
    // Decode the base64 encoded code and deploy
    const code = atob(distBinaryEntry?.resource.data as string);
    await medplum.post(medplum.fhirUrl('Bot', botIds[botName], '$deploy'), { code });
  }

  showNotification({
    icon: <IconCircleCheck />,
    title: 'Success',
    message: 'Deployed Example Bots',
  });
}
