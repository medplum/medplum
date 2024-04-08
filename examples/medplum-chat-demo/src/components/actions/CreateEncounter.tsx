import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { createReference, getReferenceString, normalizeErrorString, PatchOperation } from '@medplum/core';
import { Communication, Encounter, EncounterParticipant, Period, Practitioner, Resource } from '@medplum/fhirtypes';
import { ResourceForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useState } from 'react';
import { useEffect } from 'react';

interface CreateEncounterProps {
  readonly communication: Communication;
  readonly onChange: (communication: Communication) => void;
}

export function CreateEncounter(props: CreateEncounterProps): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const [opened, handlers] = useDisclosure(false);
  let currentUserIsRecipient = false;
  const [period, setPeriod] = useState<Period>();

  const onEncounterSubmit = async (resource: Resource): Promise<void> => {
    const encounter = resource as Encounter;
    encounter.period = period;

    try {
      // Create the encounter and update the communication to be linked to it. For more details see https://www.medplum.com/docs/communications/async-encounters
      await medplum
        .createResource(encounter)
        .then((encounter) => linkEncounterToCommunication(encounter, props.communication));

      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Encounter created.',
      });
      handlers.close();
    } catch (err) {
      showNotification({
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  };

  // A function that links a Communication to an Encounter using the Communication.encounter field. For more details see https://www.medplum.com/docs/communications/async-encounters
  const linkEncounterToCommunication = async (encounter: Encounter, communication: Communication): Promise<void> => {
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
  };

  useEffect(() => {
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
  }, [props.communication]);

  const attenders: EncounterParticipant[] = props.communication.recipient
    ? props.communication.recipient?.map((recipient) => {
        if (getReferenceString(profile) === getReferenceString(recipient)) {
          currentUserIsRecipient = true;
        }
        return {
          type: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                  code: 'ATND',
                  display: 'attender',
                },
              ],
            },
          ],
          individual: {
            reference: getReferenceString(recipient),
          },
        };
      })
    : [];

  if (!currentUserIsRecipient) {
    attenders.push({
      type: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
              code: 'ATND',
              display: 'attender',
            },
          ],
        },
      ],
      individual: {
        reference: getReferenceString(profile),
      },
    });
  }

  // A default encounter to pre-fill the form with
  const defaultEncounter: Encounter = {
    resourceType: 'Encounter',
    status: 'in-progress',
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: 'VR',
      display: 'virtual',
    },
    subject: props.communication.subject,
    participant: attenders,
    period: period,
  };

  return (
    <div>
      <Button fullWidth onClick={handlers.toggle}>
        Create Encounter
      </Button>
      <Modal opened={opened} onClose={handlers.close} title="Create a linked Encounter">
        <ResourceForm defaultValue={defaultEncounter} onSubmit={onEncounterSubmit} />
      </Modal>
    </div>
  );
}

// A function that links a Communication to an Encounter using the Communication.encounter field. For more details see https://www.medplum.com/docs/communications/async-encounters
