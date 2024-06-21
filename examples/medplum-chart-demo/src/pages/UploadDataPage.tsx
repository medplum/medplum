import { Button, LoadingOverlay } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { capitalize, getReferenceString, isOk, MedplumClient, normalizeErrorString } from '@medplum/core';
import { Bot, Bundle, BundleEntry, Practitioner } from '@medplum/fhirtypes';
import { Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import questionnaireBundle from '../../data/core/encounter-note-questionnaires.json';
import coreData from '../../data/core/encounter-types.json';
import exampleBotData from '../../data/core/example-bots.json';
import exampleData from '../../data/example/example-patient-data.json';

type UploadFunction =
  | ((medplum: MedplumClient, profile: Practitioner) => Promise<void>)
  | ((medplum: MedplumClient) => Promise<void>);

export function UploadDataPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const [pageDisabled, setPageDisabled] = useState<boolean>(false);

  const { dataType } = useParams();
  const dataTypeDisplay = dataType ? capitalize(dataType) : '';
  const buttonDisabled = dataType === 'bots' && (!checkQuestionnairesUploaded(medplum) || checkBotsUploaded(medplum));

  const handleUpload = useCallback(() => {
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
      case 'questionnaire':
        uploadFunction = uploadQuestionnaires;
        break;
      default:
        throw new Error(`Invalid upload type: ${dataType}`);
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
      <Button disabled={buttonDisabled} onClick={handleUpload}>
        Upload {dataTypeDisplay} data
      </Button>
    </Document>
  );
}

async function uploadQuestionnaires(medplum: MedplumClient): Promise<void> {
  console.log(questionnaireBundle);
  const result = await medplum.executeBatch(questionnaireBundle as Bundle);
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

async function uploadCoreData(medplum: MedplumClient): Promise<void> {
  const batch = coreData as Bundle;

  const result = await medplum.executeBatch(batch);

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

async function uploadExampleData(medplum: MedplumClient): Promise<void> {
  const exampleDataBatch = exampleData as Bundle;
  const result = await medplum.executeBatch(exampleDataBatch);

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

async function uploadExampleBots(medplum: MedplumClient, profile: Practitioner): Promise<void> {
  const questionnaires = await medplum.searchResources('Questionnaire', {
    context: 'CLINNOTEE',
  });

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

  for (const questionnaire of questionnaires) {
    transactionString = transactionString.replaceAll(`$${questionnaire.name}`, getReferenceString(questionnaire));
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

function checkQuestionnairesUploaded(medplum: MedplumClient): boolean {
  let check = false;
  const clinicalNoteQuestionnaires = medplum
    .searchResources('Questionnaire', {
      context: 'CLINNOTEE',
    })
    .read();

  const questionnairesToCheck = clinicalNoteQuestionnaires.filter(
    (questionnaire) =>
      questionnaire.title === 'Obstetric Return Visit' ||
      questionnaire.title === 'Gynecology New Visit' ||
      questionnaire.title === 'Encounter Note'
  );

  if (questionnairesToCheck.length === 3) {
    check = true;
  }

  return check;
}

function checkBotsUploaded(medplum: MedplumClient): boolean {
  const bots = medplum.searchResources('Bot').read();

  const exampleBots = bots.filter(
    (bot) =>
      bot.name === 'general-encounter-note' ||
      bot.name === 'gynecology-encounter-note' ||
      bot.name === 'obstetric-encounter-note'
  );

  if (exampleBots.length === 3) {
    return true;
  }
  return false;
}
