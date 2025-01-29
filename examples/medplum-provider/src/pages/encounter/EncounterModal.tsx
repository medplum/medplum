import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Modal, Text, Card } from '@mantine/core';
import { useState } from 'react';
import { CodeInput, CodingInput, ResourceInput, useMedplum, ValueSetAutocomplete } from '@medplum/react';
import { showNotification } from '@mantine/notifications';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { createReference, getReferenceString, normalizeErrorString } from '@medplum/core';
import { Coding, Encounter, PlanDefinition, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { usePatient } from '../../hooks/usePatient';

export const EncounterModal = (): JSX.Element => {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const location = useLocation();
  const patient = usePatient();
  const [types, setTypes] = useState<ValueSetExpansionContains[]>([]);
  const [encounterClass, setEncounterClass] = useState<Coding | undefined>();
  const [planDefinitionData, setPlanDefinitionData] = useState<PlanDefinition | undefined>();
  // Todo: create a resusable type
  const [status, setStatus] = useState<
    | 'planned'
    | 'arrived'
    | 'triaged'
    | 'in-progress'
    | 'onleave'
    | 'finished'
    | 'cancelled'
    | 'entered-in-error'
    | 'unknown'
  >('planned');
  const isOpen = location.pathname.endsWith('/Encounter/new');

  const handleClose = (): void => {
    navigate(-1);
  };

  const handleCreateEncounter = async (): Promise<void> => {
    if (!patient || !encounterClass || !planDefinitionData) {
      return;
    }

    const encounterData: Encounter = {
      resourceType: 'Encounter',
      status: status,
      statusHistory: [],
      class: encounterClass,
      classHistory: [],
      type: [
        {
          coding: types,
        },
      ],
      subject: createReference(patient),
    };

    try {
      const encounter = await medplum.createResource(encounterData);
      await medplum.post(medplum.fhirUrl('PlanDefinition', planDefinitionData.id as string, '$apply'), {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'subject',
            valueString: getReferenceString(patient),
          },
          {
            name: 'encounter',
            valueString: getReferenceString(encounter),
          },
        ],
      });

      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Encounter created',
      });

      navigate(`/Patient/${patient.id}/Encounter/${encounter.id}/chart`);
    } catch (err) {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  };

  return (
    <Modal
      opened={isOpen}
      onClose={handleClose}
      size="xl"
      title="New encounter"
      styles={{
        title: {
          fontSize: '1.125rem',
          fontWeight: 600,
        },
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <ResourceInput resourceType="Patient" name="Patient-id" defaultValue={patient} disabled={true} />

          <ValueSetAutocomplete
            name="type"
            label="Type"
            binding="http://hl7.org/fhir/ValueSet/encounter-type"
            withHelpText={true}
            maxValues={1}
            onChange={(items: ValueSetExpansionContains[]) => setTypes(items)}
          />

          <CodingInput
            name="class"
            label="Class"
            binding="http://terminology.hl7.org/ValueSet/v3-ActEncounterCode"
            onChange={setEncounterClass}
            path="Encounter.type"
          />

          <CodeInput
            name="status"
            label="Status"
            binding="http://hl7.org/fhir/ValueSet/encounter-status|4.0.1"
            maxValues={1}
            onChange={(value) => {
              if (value) {
                setStatus(value as typeof status);
              }
            }}
          />
        </div>

        <Card padding="lg" radius="md" style={{ backgroundColor: '#F8F9FA' }}>
          <Text size="md" fw={500} mb="xs">
            Apply care template
          </Text>
          <Text size="sm" color="dimmed" mb="lg">
            Optionally you can select template for new encounter. Tasks from the template will be automatically added to
            the encounter. Administrators can create and edit templates in the{' '}
            <Text component="a" href="#" variant="link">
              Medplum app
            </Text>
            .
          </Text>

          <ResourceInput
            name="plandefinition"
            resourceType="PlanDefinition"
            onChange={(value) => setPlanDefinitionData(value as PlanDefinition)}
          />
        </Card>
      </div>

      <Button
        fullWidth={false}
        style={{
          marginTop: '1.5rem',
          marginLeft: 'auto',
          display: 'block',
          backgroundColor: '#228BE6',
        }}
        onClick={handleCreateEncounter}
      >
        Create Encounter
      </Button>
    </Modal>
  );
};
