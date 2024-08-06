import { Button, LoadingOverlay } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { capitalize, getReferenceString, isOk, MedplumClient, normalizeErrorString } from '@medplum/core';
import { Bot, Bundle, BundleEntry, Practitioner, Questionnaire, Resource } from '@medplum/fhirtypes';
import { Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useCallback, useContext, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import exampleBotData from '../../data/core/example-bots.json';
import coreData from '../../data/core/patient-intake-questionnaire.json';
import exampleData from '../../data/example/example-patient-data.json';
import { IntakeQuestionnaireContext } from '../Questionnaire.context';

type UploadFunction = (medplum: MedplumClient, profile: Practitioner, questionnaire: Questionnaire) => Promise<void>;

export function UploadDataPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const [pageDisabled, setPageDisabled] = useState<boolean>(false);

  const { questionnaire } = useContext(IntakeQuestionnaireContext);

  const { dataType } = useParams();
  const dataTypeDisplay = dataType ? capitalize(dataType) : '';
  const buttonDisabled = dataType === 'bots' && (!checkQuestionnairesUploaded(medplum) || checkBotsUploaded(medplum));

  const handleUpload = useCallback(() => {
    if (!profile) {
      return;
    }

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

    uploadFunction(medplum, profile as Practitioner, questionnaire as Questionnaire)
      .then(() => navigate('/'))
      .catch((error) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(error),
        });
      })
      .finally(() => setPageDisabled(false));
  }, [medplum, profile, questionnaire, dataType, navigate]);

  return (
    <Document>
      <LoadingOverlay visible={pageDisabled} />
      <Button disabled={buttonDisabled} onClick={handleUpload}>
        Upload {dataTypeDisplay} data
      </Button>
    </Document>
  );
}

async function uploadCoreData(medplum: MedplumClient): Promise<void> {
  const batch = coreData as Bundle;

  const result = await medplum.executeBatch(batch);

  if (result.entry?.every((entry) => entry.response?.outcome && isOk(entry.response?.outcome))) {
    await setTimeout(
      () =>
        showNotification({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Uploaded Core Data',
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

  if (result.entry?.every((entry) => entry.response?.outcome && isOk(entry.response?.outcome))) {
    await setTimeout(
      () =>
        showNotification({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Uploaded Example Data',
        }),
      1000
    );
  } else {
    throw new Error('Error uploading example data');
  }
}

async function uploadExampleBots(
  medplum: MedplumClient,
  profile: Practitioner,
  questionnaire: Questionnaire
): Promise<void> {
  let transactionString = JSON.stringify(exampleBotData);
  const botEntries: BundleEntry[] =
    (exampleBotData as Bundle).entry?.filter((e: any) => (e.resource as Resource)?.resourceType === 'Bot') || [];
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

  transactionString = transactionString.replaceAll(`$${questionnaire.name}`, getReferenceString(questionnaire));

  // Execute the transaction to upload / update the bot
  const transaction = JSON.parse(transactionString);
  await medplum.executeBatch(transaction);

  // Deploy the new bots
  for (const entry of botEntries) {
    const botName = (entry?.resource as Bot)?.name as string;
    const distUrl = (entry.resource as Bot).executableCode?.url;
    const distBinaryEntry = exampleBotData.entry.find((e: any) => e.fullUrl === distUrl);
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
  const questionnairesToCheck = medplum.searchResources('Questionnaire', { name: 'patient-intake' }).read();

  if (questionnairesToCheck.length === 1) {
    check = true;
  }

  return check;
}

function checkBotsUploaded(medplum: MedplumClient): boolean {
  const exampleBots = medplum.searchResources('Bot', { name: 'intake-form' }).read();

  if (exampleBots.length === 1) {
    return true;
  }
  return false;
}
