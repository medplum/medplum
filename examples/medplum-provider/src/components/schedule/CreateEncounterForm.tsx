// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Stack, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { isReference } from '@medplum/core';
import type { Appointment, Coding, Patient, PlanDefinition, Practitioner } from '@medplum/fhirtypes';
import { CodingInput, Form, ResourceInput, useMedplum } from '@medplum/react';
import { IconAlertSquareRounded, IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { createEncounter, encounterUrl } from '../../utils/encounter';
import { showErrorNotification } from '../../utils/notifications';
import { PlanDefinitionSummary } from '../plandefinition/PlanDefinitionSummary';

export interface CreateEncounterFormProps {
  appointment: WithId<Appointment>;
}

export function CreateEncounterForm(props: CreateEncounterFormProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();

  const [planDefinition, setPlanDefinition] = useState<PlanDefinition | undefined>();
  const [encounterClass, setEncounterClass] = useState<Coding | undefined>();

  const patientRefs = useMemo(
    () => props.appointment.participant.map((p) => p.actor).filter((actor) => isReference<Patient>(actor, 'Patient')),
    [props.appointment.participant]
  );

  const practitionerRefs = useMemo(
    () =>
      props.appointment.participant
        .map((p) => p.actor)
        .filter((actor) => isReference<Practitioner>(actor, 'Practitioner')),
    [props.appointment.participant]
  );

  const handleSubmit = useCallback(async () => {
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
        patientRefs[0],
        planDefinition,
        props.appointment,
        practitionerRefs[0]
      );

      navigate(encounterUrl(encounter))?.catch(console.error);
    } catch (err) {
      showErrorNotification(err);
    }
  }, [medplum, encounterClass, planDefinition, props.appointment, navigate, patientRefs, practitionerRefs]);

  if (practitionerRefs.length > 1) {
    return (
      <Alert color="yellow" icon={<IconInfoCircle />}>
        Too many Practitioners to create Encounter.
      </Alert>
    );
  }
  if (practitionerRefs.length === 0) {
    return (
      <Alert color="yellow" icon={<IconInfoCircle />}>
        No Practitioner to create Encounter.
      </Alert>
    );
  }
  if (patientRefs.length > 1) {
    return (
      <Alert color="yellow" icon={<IconInfoCircle />}>
        Too many Patients to create Encounter.
      </Alert>
    );
  }
  if (patientRefs.length === 0) {
    return (
      <Alert color="yellow" icon={<IconInfoCircle />}>
        No Patient to create Encounter.
      </Alert>
    );
  }

  return (
    <Form onSubmit={handleSubmit}>
      <Stack gap="md">
        <Title order={4}>Set Up Encounter</Title>

        <ResourceInput<Practitioner>
          name="practitioner"
          resourceType="Practitioner"
          label="Practitioner"
          defaultValue={practitionerRefs[0]}
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
