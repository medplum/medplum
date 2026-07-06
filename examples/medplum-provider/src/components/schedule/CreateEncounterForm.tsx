// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Stack, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Appointment, Coding, Patient, PlanDefinition, Practitioner, Reference } from '@medplum/fhirtypes';
import { CodingInput, Form, ResourceInput, useMedplum } from '@medplum/react';
import { IconAlertSquareRounded } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import { createEncounter, encounterUrl } from '../../utils/encounter';
import { showErrorNotification } from '../../utils/notifications';
import { PlanDefinitionSummary } from '../plandefinition/PlanDefinitionSummary';

export interface CreateEncounterFormProps {
  appointment: WithId<Appointment>;
  patientRef: Reference<Patient>;
  practitionerRef: Reference<Practitioner> | undefined;
}

export function CreateEncounterForm(props: CreateEncounterFormProps): JSX.Element {
  const { patientRef, practitionerRef } = props;
  const medplum = useMedplum();
  const navigate = useNavigate();

  const [planDefinition, setPlanDefinition] = useState<PlanDefinition | undefined>();
  const [encounterClass, setEncounterClass] = useState<Coding | undefined>();

  const handleSubmit = useCallback(async () => {
    if (!practitionerRef) {
      showNotification({
        color: 'yellow',
        icon: <IconAlertSquareRounded />,
        title: 'Error',
        message: 'Appointment has no Practitioner participant',
      });
      return;
    }

    if (!encounterClass || !planDefinition) {
      showNotification({
        color: 'yellow',
        icon: <IconAlertSquareRounded />,
        title: 'Error',
        message: 'Please fill out required fields.',
      });
      return;
    }

    try {
      const encounter = await createEncounter(
        medplum,
        encounterClass,
        patientRef,
        planDefinition,
        props.appointment,
        practitionerRef
      );

      navigate(encounterUrl(encounter))?.catch(console.error);
    } catch (err) {
      showErrorNotification(err);
    }
  }, [medplum, patientRef, encounterClass, planDefinition, props.appointment, navigate, practitionerRef]);

  return (
    <Form onSubmit={handleSubmit}>
      <Stack gap="md">
        <Title order={4}>Set Up Encounter</Title>

        <ResourceInput<Practitioner>
          name="practitioner"
          resourceType="Practitioner"
          label="Practitioner"
          defaultValue={practitionerRef}
          disabled={true}
          required={true}
        />

        <CodingInput
          name="class"
          label="Encounter Class"
          binding="http://terminology.hl7.org/ValueSet/v3-ActEncounterCode"
          required={true}
          onChange={setEncounterClass}
          path="Encounter.class"
        />

        <ResourceInput<PlanDefinition>
          name="plandefinition"
          resourceType="PlanDefinition"
          label="Care template"
          onChange={setPlanDefinition}
          required={true}
        />

        <PlanDefinitionSummary planDefinition={planDefinition} />

        <Button fullWidth type="submit" disabled={!planDefinition || !encounterClass}>
          Apply
        </Button>
      </Stack>
    </Form>
  );
}
