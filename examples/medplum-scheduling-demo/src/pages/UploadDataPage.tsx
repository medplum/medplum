import { Button, LoadingOverlay } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  capitalize,
  createReference,
  getReferenceString,
  isOk,
  MedplumClient,
  normalizeErrorString,
} from '@medplum/core';
import {
  Appointment,
  Bot,
  Bundle,
  BundleEntry,
  Patient,
  Practitioner,
  Reference,
  Resource,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { Document, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import coreData from '../../data/core/appointment-service-types.json';
import exampleBotData from '../../data/core/example-bots.json';

type UploadFunction = (medplum: MedplumClient, profile: Practitioner) => Promise<void>;

export function UploadDataPage(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const [pageDisabled, setPageDisabled] = useState<boolean>(false);

  const { dataType } = useParams();
  const dataTypeDisplay = dataType ? capitalize(dataType) : '';
  const buttonDisabled = dataType === 'bots' && checkBotsUploaded(medplum);

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
      case 'bots':
        uploadFunction = uploadExampleBots;
        break;
      case 'example':
        uploadFunction = uploadExampleData;
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

async function uploadExampleBots(medplum: MedplumClient, profile: Practitioner): Promise<void> {
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

function checkBotsUploaded(medplum: MedplumClient): boolean {
  const bots = medplum.searchResources('Bot').read();

  const exampleBots = bots.filter(
    (bot) =>
      bot.name &&
      ['book-appointment', 'cancel-appointment', 'set-availability', 'block-availability'].includes(bot.name)
  );

  if (exampleBots.length === 4) {
    return true;
  }
  return false;
}

async function uploadExampleData(medplum: MedplumClient, profile: Practitioner): Promise<void> {
  // Note that the Schedule resource is created in the App.tsx file
  const schedule = await medplum.searchOne('Schedule', { actor: getReferenceString(profile) });
  if (!schedule) {
    throw new Error('Schedule not found');
  }

  const entries: BundleEntry<Patient | Slot | Appointment>[] = [...createPatientEntries()];

  const practitionerReference = createReference(profile);
  const homerReference = { reference: 'urn:uuid:bd90afcc-4f44-4c13-8710-84ddc1bce347', display: 'Homer Simpson' };
  const scheduleReference = createReference(schedule);

  const today = new Date();

  createWeekSlots(today, -1, entries, scheduleReference, practitionerReference, homerReference);
  createWeekSlots(today, 0, entries, scheduleReference, practitionerReference, homerReference);
  createWeekSlots(today, 1, entries, scheduleReference, practitionerReference, homerReference);

  const batch: Bundle = {
    resourceType: 'Bundle',
    type: 'batch',
    entry: entries,
  };

  const result = await medplum.executeBatch(batch);
  if (result.entry?.every((entry) => entry.response?.outcome && isOk(entry.response?.outcome))) {
    setTimeout(
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

function createPatientEntries(): BundleEntry<Patient>[] {
  return [
    {
      fullUrl: 'urn:uuid:bd90afcc-4f44-4c13-8710-84ddc1bce347',
      request: { method: 'PUT', url: 'Patient?name=homer' },
      resource: {
        resourceType: 'Patient',
        active: true,
        name: [{ family: 'Simpson', given: ['Homer'] }],
        gender: 'male',
        birthDate: '1956-05-12',
      },
    },
    {
      fullUrl: 'urn:uuid:eca66352-415c-4dab-add1-e4ed8a156408',
      request: { method: 'PUT', url: 'Patient?name=marge' },
      resource: {
        resourceType: 'Patient',
        active: true,
        name: [{ family: 'Simpson', given: ['Marge'] }],
        gender: 'female',
        birthDate: '1958-03-19',
      },
    },
  ];
}

function createWeekSlots(
  baseDate: Date,
  weekOffset: number,
  entries: BundleEntry[],
  scheduleReference: Reference<Schedule>,
  practitionerReference: Reference<Practitioner>,
  patientReference: Reference<Patient>
): void {
  // Calculate Monday, Wednesday, and Friday of the week
  const monday = new Date(baseDate);
  monday.setDate(monday.getDate() + weekOffset * 7 - ((baseDate.getDay() + 6) % 7));
  const wednesday = new Date(monday);
  wednesday.setDate(wednesday.getDate() + 2);
  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 4);

  // Create free slots and appointments for Monday and Wednesday
  [monday, wednesday].forEach((day, index) => {
    for (let hour = 9; hour < 17; hour++) {
      // Skip lunch hour
      if (hour === 12) {
        continue;
      }

      const startTime = new Date(day);
      startTime.setHours(hour, 0, 0, 0);
      const endTime = new Date(startTime);
      endTime.setHours(hour + 1, 0, 0, 0);

      const freeSlotEntry = createSlot(scheduleReference, startTime, endTime, 'free');

      if (weekOffset === -1 && index === 0 && hour === 9) {
        // Create a cancelled appointment on Monday at 9am + a replacement free slot
        const busySlotEntry = createSlot(scheduleReference, startTime, endTime, 'busy');
        entries.push(busySlotEntry);
        entries.push(createAppointment(practitionerReference, patientReference, busySlotEntry, 'cancelled'));
        entries.push(freeSlotEntry);
      } else if (weekOffset === 0 && index === 0 && hour === 10) {
        // Create a fulfilled appointment on Monday at 10am
        const busySlotEntry = createSlot(scheduleReference, startTime, endTime, 'busy');
        entries.push(busySlotEntry);
        entries.push(createAppointment(practitionerReference, patientReference, busySlotEntry, 'fulfilled'));
      } else if (weekOffset === 1 && index === 0 && hour === 11) {
        // Create an upcoming appointment on Monday at 11am
        const busySlotEntry = createSlot(scheduleReference, startTime, endTime, 'busy');
        entries.push(busySlotEntry);
        entries.push(createAppointment(practitionerReference, patientReference, busySlotEntry, 'booked'));
      } else {
        // Create a free slot
        entries.push(freeSlotEntry);
      }
    }
  });

  // Create busy-unavailable slot for Friday from 9am to 5pm
  const busyUnavailableSlot = createSlot(
    scheduleReference,
    new Date(new Date(friday).setHours(9, 0, 0, 0)),
    new Date(new Date(friday).setHours(17, 0, 0, 0)),
    'busy-unavailable'
  );
  entries.push(busyUnavailableSlot);
}

function createSlot(schedule: Reference<Schedule>, start: Date, end: Date, status: Slot['status']): BundleEntry<Slot> {
  return {
    fullUrl: `urn:uuid:${uuidv4()}`,
    request: { url: 'Slot', method: 'POST' },
    resource: {
      resourceType: 'Slot',
      schedule,
      status,
      start: start.toISOString(),
      end: end.toISOString(),
    },
  };
}

function createAppointment(
  practitioner: Reference<Practitioner>,
  patient: Reference<Patient>,
  slotEntry: BundleEntry<Slot>,
  status: Appointment['status']
): BundleEntry<Appointment> {
  return {
    request: { url: 'Appointment', method: 'POST' },
    resource: {
      resourceType: 'Appointment',
      status,
      slot: [{ reference: slotEntry.fullUrl }],
      start: (slotEntry.resource as Slot).start,
      end: (slotEntry.resource as Slot).end,
      participant: [
        { actor: patient, status: 'accepted' },
        { actor: practitioner, status: 'accepted' },
      ],
    },
  };
}
