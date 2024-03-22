import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import {
  createReference,
  getReferenceString,
  MedplumClient,
  normalizeErrorString,
  PatchOperation,
} from '@medplum/core';
import { Communication, Encounter, Practitioner, Resource } from '@medplum/fhirtypes';
import { ResourceForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';

interface CreateEncounterProps {
  readonly communication: Communication;
  readonly onChange: (communication: Communication) => void;
}

export function CreateEncounter(props: CreateEncounterProps): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const [opened, handlers] = useDisclosure(false);

  const onEncounterSubmit = async (resource: Resource): Promise<void> => {
    const encounter = resource as Encounter;

    try {
      // Create the encounter and update the communication to be linked to it. For more details see https://www.medplum.com/docs/communications/async-encounters
      await medplum.createResource(encounter);
      const updatedCommunication = await linkEncounterToCommunication(encounter, props.communication, medplum);
      if (updatedCommunication) {
        props.onChange(updatedCommunication);
      }
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Encounter created.',
      });
    } catch (err) {
      showNotification({
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  };

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
    participant: [
      {
        type: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                code: 'ADM',
                display: 'admitter',
              },
            ],
          },
        ],
        individual: {
          reference: getReferenceString(profile),
        },
      },
    ],
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
async function linkEncounterToCommunication(
  encounter: Encounter,
  communication: Communication,
  medplum: MedplumClient
): Promise<Communication | void> {
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
    return result;
  } catch (err) {
    console.error(err);
  }
}
