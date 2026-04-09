// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Group, Loader, Stack, Switch, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { EMPTY, formatReferenceString, getExtensionValue, getReferenceString } from '@medplum/core';
import type { HealthcareService, Reference, Schedule } from '@medplum/fhirtypes';
import { Document, MedplumLink, useMedplum } from '@medplum/react';
import { useResource, useSearchResources } from '@medplum/react-hooks';
import { IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Fragment, useState } from 'react';
import { useParams } from 'react-router';
import { AlphaBanner } from '../../components/AlphaBanner';
import { DocsLink } from '../../components/DocsLink';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';
import { hasSchedulingParameters } from '../../utils/scheduling';
import { isCodeableReferenceLikeTo, ServiceTypeReferenceURI, toCodeableReferenceLike } from '../../utils/servicetype';

export function ScheduleSettings(props: { schedule: Schedule }): JSX.Element | null {
  const medplum = useMedplum();
  const [services, servicesLoading] = useSearchResources('HealthcareService');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Store a copy of the Schedule that we can mutate while the viewer manipulates
  // the UI
  const [schedule, setSchedule] = useState({ ...props.schedule });

  if (servicesLoading) {
    return <Loader />;
  }

  if (!services?.length) {
    return (
      <Group>
        <Alert color="red" variant="outline">
          No HealthcareServices found.
        </Alert>
      </Group>
    );
  }

  const schedulableServices = services.filter((service) => hasSchedulingParameters(service));
  const unschedulableServices = services.filter((service) => !hasSchedulingParameters(service));

  function toggleServiceType(service: WithId<HealthcareService>, enabled: boolean): void {
    setDirty(true);
    if (enabled) {
      const serviceType = toCodeableReferenceLike(service);
      setSchedule((prevValue) => ({
        ...prevValue,
        serviceType: [...(prevValue.serviceType ?? EMPTY), ...serviceType],
      }));
    } else {
      setSchedule((prevValue) => {
        const refString = getReferenceString(service);
        const serviceType = prevValue.serviceType?.filter((cc) => {
          const ref = getExtensionValue(cc, ServiceTypeReferenceURI) as Reference<HealthcareService> | undefined;
          return ref?.reference !== refString;
        });
        return { ...prevValue, serviceType };
      });
    }
  }

  async function submit(): Promise<void> {
    setSaving(true);
    try {
      await medplum.updateResource(schedule);
      showSuccessNotification({ message: 'Schedule updated' });
      setDirty(false);
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap="xl">
      <Stack gap="sm">
        <Title order={3}>Schedule Actor</Title>
        <div>
          {schedule.actor.map((actor, i) => (
            <Fragment key={actor.reference}>
              {i > 0 && ', '}
              <MedplumLink to={actor}>{formatReferenceString(actor)}</MedplumLink>
            </Fragment>
          ))}
        </div>
      </Stack>
      <Stack gap="sm">
        <Title order={3}>Schedulable Healthcare Services</Title>
        {schedulableServices.map((service) => (
          <Switch
            key={service.id}
            label={service.name}
            checked={isCodeableReferenceLikeTo(schedule.serviceType, service)}
            onChange={(e) => toggleServiceType(service, e.target.checked)}
          />
        ))}
      </Stack>
      {unschedulableServices.length > 0 && (
        <Stack gap="sm">
          <Title order={4}>Unschedulable Healthcare Services</Title>
          <Group>
            <Alert color="yellow.5" variant="outline" icon={<IconInfoCircle />}>
              These services do not have a{' '}
              <DocsLink path="scheduling/defining-availability">SchedulingParameters</DocsLink> extension.
            </Alert>
          </Group>
          <ul>
            {unschedulableServices.map((service) => (
              <li key={service.id}>{service.name}</li>
            ))}
          </ul>
        </Stack>
      )}
      <Group justify="flex-end">
        <Button variant="outline" disabled={saving} component={MedplumLink} to={`/Calendar/Schedule/${schedule.id}`}>
          {dirty ? 'Cancel' : 'Back'}
        </Button>
        <Button disabled={!dirty} onClick={submit} loading={saving}>
          Save Changes
        </Button>
      </Group>
    </Stack>
  );
}

export function ScheduleSettingsPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const schedule = useResource<Schedule>({ reference: `Schedule/${id}` });

  return (
    <Document>
      <Title order={1}>Schedule Settings</Title>
      <AlphaBanner bdrs="md" mb="lg">
        Medplum Scheduling is in an Alpha period and is subject to change.
      </AlphaBanner>
      {schedule ? <ScheduleSettings schedule={schedule} key={schedule.id} /> : <Loader />}
    </Document>
  );
}
