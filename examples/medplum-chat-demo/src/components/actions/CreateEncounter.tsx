import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { createReference, normalizeErrorString, parseReference, PatchOperation } from '@medplum/core';
import {
  Communication,
  Encounter,
  Group,
  Patient,
  Period,
  Practitioner,
  Reference,
  Resource,
} from '@medplum/fhirtypes';
import { ResourceForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAttenders } from '../../utils';

interface CreateEncounterProps {
  readonly communication: Communication;
  readonly onChange: (communication: Communication) => void;
}

export function CreateEncounter(props: CreateEncounterProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const profile = useMedplumProfile() as Practitioner;
  const [opened, handlers] = useDisclosure(false);
  const [period, setPeriod] = useState<Period>();

  async function onEncounterSubmit(resource: Resource): Promise<void> {
    const encounterData = resource as Encounter;
    encounterData.period = period;

    try {
      // Create the encounter and update the communication to be linked to it. For more details see https://www.medplum.com/docs/communications/async-encounters
      const encounter = await medplum.createResource(encounterData);
      linkEncounterToCommunication(encounter, props.communication).catch(console.error);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Encounter created.',
      });
      handlers.close();
      navigate(`/Encounter/${encounter.id}`);
    } catch (err) {
      showNotification({
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  }

  // A function that links a Communication to an Encounter using the Communication.encounter field. For more details see https://www.medplum.com/docs/communications/async-encounters
  async function linkEncounterToCommunication(encounter: Encounter, communication: Communication): Promise<void> {
    const communicationId = communication.id as string;
    const encounterReference = createReference(encounter);

    const ops: PatchOperation[] = [
      // Test to prevent race conditions
      { op: 'test', path: '/meta/versionId', value: communication.meta?.versionId },
      // Patch the encounter field of the communication
      { op: 'add', path: '/encounter', value: encounterReference },
    ];

    try {
      // Update the communication
      const result = await medplum.patchResource('Communication', communicationId, ops);
      props.onChange(result);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    // When creating an encounter, the period should be from the time the first message in the thread was sent until the last message was sent
    const getEncounterPeriod = async (thread: Communication): Promise<Period> => {
      const messages = await medplum.searchResources('Communication', {
        'part-of': `Communication/${thread.id}`,
        _sort: 'sent',
      });

      const period: Period = {
        start: messages[0].sent,
        end: messages[messages.length - 1].sent,
      };

      return period;
    };

    getEncounterPeriod(props.communication).then(setPeriod).catch(console.error);
  }, [medplum, props.communication]);

  const attenders = getAttenders(props.communication.recipient, profile, false);
  const subject = getEncounterSubject(props.communication);

  // A default encounter to pre-fill the form with
  const defaultEncounter: Encounter = {
    resourceType: 'Encounter',
    status: 'in-progress',
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: 'VR',
      display: 'virtual',
    },
    subject: subject,
    participant: attenders,
    period: period,
  };

  return (
    <div>
      <Button fullWidth onClick={handlers.toggle}>
        Create Encounter
      </Button>
      <Modal opened={opened} onClose={handlers.close} title="Create a linked Encounter" size="lg">
        <ResourceForm defaultValue={defaultEncounter} onSubmit={onEncounterSubmit} />
      </Modal>
    </div>
  );
}

function getEncounterSubject(thread: Communication): Reference<Patient | Group> | undefined {
  // If the thread has a subject, this will be the Encounter subject
  if (thread.subject) {
    return thread.subject;
  }

  if (!thread.recipient || thread.recipient.length === 0) {
    return undefined;
  }

  // Filter for only the recipients that are patients
  const patients = thread.recipient.filter(
    (recipient) => parseReference(recipient)[0] === 'Patient'
  ) as Reference<Patient>[];

  // If there are none, or more than one do not return a subject
  if (patients.length !== 1) {
    return undefined;
  }

  // Return a the patient if there is only one
  return patients[0];
}
