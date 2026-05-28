// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Group, Loader, Stack, Title } from '@mantine/core';
import { EMPTY, getExtensionValue, isOk, normalizeErrorString } from '@medplum/core';
import type { Coding, HealthcareService, OperationOutcome, ResourceType } from '@medplum/fhirtypes';
import { CodingInput, Form, SubmitButton } from '@medplum/react';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { AlphaBanner } from '../../components/AlphaBanner';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';
import { SchedulingEncounterCodingURI } from '../../utils/scheduling';

interface HealthcareServiceSchedulingFormProps {
  readonly service: HealthcareService;
}

function HealthcareServiceSchedulingForm({ service }: HealthcareServiceSchedulingFormProps): JSX.Element {
  const medplum = useMedplum();
  const [encounterClass, setEncounterClass] = useState<Coding | undefined>(
    () => getExtensionValue(service, SchedulingEncounterCodingURI) as Coding | undefined
  );

  const handleSubmit = async (): Promise<void> => {
    const updated = {
      ...service,
      extension: (service.extension ?? EMPTY).filter((ext) => ext.url !== SchedulingEncounterCodingURI),
    };

    if (encounterClass) {
      updated.extension.push({
        url: SchedulingEncounterCodingURI,
        valueCoding: encounterClass,
      });
    }

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
          path="Encounter.type"
          description="The classification to apply to encounters created when scheduling this HealthcareService"
          defaultValue={encounterClass}
          onChange={setEncounterClass}
        />
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
