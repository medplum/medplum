import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { createReference, getReferenceString, MedplumClient, PatchOperation } from '@medplum/core';
import { Communication, Encounter, Practitioner, Resource } from '@medplum/fhirtypes';
import { ResourceForm, useMedplum, useMedplumProfile } from '@medplum/react';

interface CreateEncounterProps {
  readonly communication: Communication;
  readonly onChange: (communication: Communication) => void;
}

export function CreateEncounter(props: CreateEncounterProps): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const [opened, handlers] = useDisclosure(false);

  const onEncounterSubmit = async (resource: Resource) => {
    const encounter = resource as Encounter;

    try {
      await medplum.createResource(encounter);
      const updatedCommunication = await linkEncounterToCommunication(encounter, props.communication, medplum);
      console.log('Success');
      if (updatedCommunication) {
        props.onChange(updatedCommunication);
      }
    } catch (err) {
      console.error(err);
    }
  };

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

async function linkEncounterToCommunication(
  encounter: Encounter,
  communication: Communication,
  medplum: MedplumClient
): Promise<Communication | undefined> {
  const communicationId = communication.id as string;
  const encounterReference = createReference(encounter);

  const ops: PatchOperation[] = [
    { op: 'test', path: '/meta/versionId', value: communication.meta?.versionId },
    { op: 'add', path: '/encounter', value: encounterReference },
  ];

  try {
    const result = await medplum.patchResource('Communication', communicationId, ops);
    console.log('Communication updated!');
    return result;
  } catch (err) {
    console.error(err);
  }
}
