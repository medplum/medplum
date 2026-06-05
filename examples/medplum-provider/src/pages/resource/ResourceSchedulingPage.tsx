// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Group, Input, Loader, Stack, Title } from '@mantine/core';
import { EMPTY, getExtensionValue, isOk, normalizeErrorString } from '@medplum/core';
import type {
  Coding,
  Extension,
  HealthcareService,
  OperationOutcome,
  PlanDefinition,
  Reference,
  ResourceType,
} from '@medplum/fhirtypes';
import { CodingInput, Form, ReferenceInput, SubmitButton } from '@medplum/react';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { AlphaBanner } from '../../components/AlphaBanner';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';
import { SchedulingEncounterCodingURI, SchedulingPlanDefinitionURI } from '../../utils/scheduling';

interface HealthcareServiceSchedulingFormProps {
  readonly service: HealthcareService;
}

function HealthcareServiceSchedulingForm({ service }: HealthcareServiceSchedulingFormProps): JSX.Element {
  const medplum = useMedplum();
  const [encounterClass, setEncounterClass] = useState<Coding | undefined>(
    () => getExtensionValue(service, SchedulingEncounterCodingURI) as Coding | undefined
  );
  const [planDefinition, setPlanDefinition] = useState<Reference<PlanDefinition> | undefined>(
    () => getExtensionValue(service, SchedulingPlanDefinitionURI) as Reference<PlanDefinition> | undefined
  );

  const handleSubmit = async (): Promise<void> => {
    // This implementation is slightly tricky in order to try to update any existing extensions in
    // place in the `extensions` array. This helps keep the history diff easy to read.
    const nextExts: [string, Extension | undefined][] = [
      [
        SchedulingEncounterCodingURI,
        encounterClass ? { url: SchedulingEncounterCodingURI, valueCoding: encounterClass } : undefined,
      ],
      [
        SchedulingPlanDefinitionURI,
        planDefinition ? { url: SchedulingPlanDefinitionURI, valueReference: planDefinition } : undefined,
      ],
    ];

    const extensions = [...(service.extension ?? EMPTY)];
    for (const [url, next] of nextExts) {
      const idx = extensions.findIndex((e) => e.url === url);
      if (next !== undefined) {
        if (idx >= 0) {
          extensions[idx] = next;
        } else {
          extensions.push(next);
        }
      } else if (idx >= 0) {
        extensions.splice(idx, 1);
      }
    }

    const updated = { ...service, extension: extensions };

    try {
      await medplum.updateResource(updated);
      showSuccessNotification({ message: 'Scheduling configuration saved' });
    } catch (err) {
      showErrorNotification(err);
    }
  };

  return (
    <Form onSubmit={handleSubmit}>
      <Stack gap="md">
        <Title order={2}>{service.name} - Scheduling Configuration</Title>
        <AlphaBanner bdrs="md">Medplum Scheduling is in an Alpha period and is subject to change.</AlphaBanner>
        <CodingInput
          name="encounterClass"
          label="Encounter Class"
          binding="http://terminology.hl7.org/ValueSet/v3-ActEncounterCode"
          path="Encounter.class"
          description="The classification to apply to encounters created when scheduling this HealthcareService"
          defaultValue={encounterClass}
          onChange={setEncounterClass}
          data-testid="encounterClass"
        />
        <Input.Wrapper
          label="Plan Definition"
          description="The plan definition to apply to encounters created when scheduling this HealthcareService"
        >
          {/*
            Tricky: The complex nesting of the `<input>` deeply inside
            ReferenceInput prevents the margins here from applying
            normally, so we add a custom spacing wrapper that matches what
            Mantine would normally do.
          */}
          <div style={{ marginTop: 'calc(var(--mantine-spacing-xs) / 2)' }}>
            <ReferenceInput
              name="planDefinition"
              targetTypes={['PlanDefinition']}
              defaultValue={planDefinition}
              onChange={setPlanDefinition}
            />
          </div>
        </Input.Wrapper>
        <Group justify="flex-end">
          <SubmitButton>Save</SubmitButton>
        </Group>
      </Stack>
    </Form>
  );
}

export function ResourceSchedulingPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType | undefined; id: string | undefined };
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const resource = useResource({ reference: `${resourceType}/${id}` }, setOutcome);
  const loading = !resource && !outcome;

  useEffect(() => {
    setOutcome(undefined);
  }, [resourceType, id]);

  if (resourceType !== 'HealthcareService') {
    return (
      <Alert color="yellow" icon={<IconAlertCircle />}>
        Unsupported resource type
      </Alert>
    );
  }

  if (loading) {
    return <Loader />;
  }

  if (outcome && !isOk(outcome)) {
    return (
      <Alert color="red" icon={<IconAlertCircle />}>
        {normalizeErrorString(outcome)}
      </Alert>
    );
  }

  if (!resource) {
    return (
      <Alert color="red" icon={<IconAlertCircle />}>
        Error loading resource.
      </Alert>
    );
  }

  return <HealthcareServiceSchedulingForm service={resource as HealthcareService} />;
}
