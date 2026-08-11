// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import {
  deepClone,
  EMPTY,
  formatReferenceString,
  getExtensionValue,
  getReferenceString,
  getScheduleParameters,
  getSchedulingTimezone,
  hasSchedulingParameters,
  serviceTypeIncludesService,
  ServiceTypeReferenceURI,
  toServiceTypeCodeableConcepts,
} from '@medplum/core';
import type { HealthcareService, Reference, Schedule } from '@medplum/fhirtypes';
import { Document, MedplumLink, OperationOutcomeAlert, useMedplum } from '@medplum/react';
import { useResource, useSearchResources } from '@medplum/react-hooks';
import { ScheduleAvailabilityEditor } from '@medplum/react-scheduling';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Fragment, useState } from 'react';
import { useParams } from 'react-router';
import { DocsLink } from '../../components/DocsLink';
import { ReleaseStageBanner } from '../../components/ReleaseStageBanner';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';

// Eventually we should paginate the HealthcareService search so this is not a
// hard limit. We expect that 1000 rows should be plenty for most providers, so
// temporarily shipping with a single large page fetch.
const MAX_PAGE_SIZE = 1000;

export function ScheduleSettings(props: { schedule: Schedule }): JSX.Element | null {
  const medplum = useMedplum();
  const [services, servicesLoading, servicesOutcome] = useSearchResources('HealthcareService', {
    _sort: 'name',
    _count: MAX_PAGE_SIZE.toString(),
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // The Modal stays mounted so Mantine can animate open/close; only
  // `editorOpened` toggles. `editingService` selects which service the editor
  // edits and is only cleared after the close animation via
  // `onExitTransitionEnd`, so the contents stay put while the modal fades out.
  const [editingService, setEditingService] = useState<WithId<HealthcareService>>();
  const [editorOpened, editorHandlers] = useDisclosure(false);

  // Store a copy of the Schedule that we can mutate while the viewer manipulates
  // the UI
  const [schedule, setSchedule] = useState(deepClone(props.schedule));

  // Scheduling falls back to the actor's timezone extension when neither the
  // Schedule nor the service parameters specify one, which is the most common
  // setup, so the actor is loaded to resolve the timezone the way the server
  // does. Scheduling requires exactly one actor per Schedule.
  const actor = useResource(schedule.actor[0]);

  function toggleServiceType(service: WithId<HealthcareService>, enabled: boolean): void {
    setDirty(true);
    if (enabled) {
      const serviceType = toServiceTypeCodeableConcepts(service);
      setSchedule((prevValue) => ({
        ...prevValue,
        serviceType: [...(prevValue.serviceType ?? EMPTY), ...serviceType],
      }));
    } else {
      // Only the serviceType link is removed; any SchedulingParameters override
      // for this service is deliberately kept so re-enabling restores the hours
      // the user configured. The override is inert while unlinked, because
      // scheduling resolves parameters only for services listed in serviceType.
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
      const updated = await medplum.updateResource(schedule, {
        headers: {
          'If-Match': schedule.meta?.versionId ? `W/"${schedule.meta.versionId}"` : '',
        },
      });
      setSchedule(deepClone(updated));
      showSuccessNotification({ message: 'Schedule updated' });
      setDirty(false);
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setSaving(false);
    }
  }

  if (servicesLoading) {
    return <Loader />;
  }

  return (
    <Stack gap="lg">
      <Stack gap="0">
        <Title order={3}>Visit Service Types</Title>
        <Text fs="italic" c="dimmed">
          Choose what visit service types can be scheduled on this calendar. Learn more about{' '}
          <DocsLink path="scheduling">configuring Scheduling</DocsLink>.
        </Text>
      </Stack>
      <OperationOutcomeAlert outcome={servicesOutcome} />
      {!services?.length && (
        <Alert color="red" variant="outline">
          No visit service types found.
        </Alert>
      )}
      {(services?.length ?? 0) >= MAX_PAGE_SIZE && (
        <Alert color="yellow" variant="outline" icon={<IconAlertCircle />}>
          Visit service type page size reached; some rows may not have been fetched.
        </Alert>
      )}
      <Stack gap="sm">
        {services?.map((service) => {
          const schedulable = hasSchedulingParameters(service);
          const enabled = serviceTypeIncludesService(schedule.serviceType, service);
          const overriding = enabled && getScheduleParameters(schedule, service, 'availability').length > 0;
          return (
            <Group key={service.id} justify="space-between">
              <Tooltip
                label={'This visit service type does not have a SchedulingParameters extension'}
                disabled={schedulable}
                position="right"
                refProp="rootRef"
                withArrow
              >
                <Switch
                  label={service.name}
                  checked={enabled}
                  onChange={(e) => toggleServiceType(service, e.target.checked)}
                  disabled={!schedulable}
                />
              </Tooltip>
              {enabled && (
                <Group gap="xs" wrap="nowrap">
                  <Tooltip
                    label={
                      overriding
                        ? 'This calendar uses custom hours that override the service default'
                        : 'This calendar follows the default hours defined on the service'
                    }
                    position="left"
                    withArrow
                  >
                    <Badge color={overriding ? 'blue' : 'gray'} variant="light">
                      {overriding ? 'Custom hours' : 'Service default'}
                    </Badge>
                  </Tooltip>
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    onClick={() => {
                      setEditingService(service);
                      editorHandlers.open();
                    }}
                  >
                    Edit weekly hours
                  </Button>
                </Group>
              )}
            </Group>
          );
        })}
      </Stack>
      <Modal
        opened={editorOpened}
        onClose={editorHandlers.close}
        onExitTransitionEnd={() => setEditingService(undefined)}
        size="xl"
        centered
        scrollAreaComponent={ScrollArea.Autosize}
        overlayProps={{ backgroundOpacity: 0.5, blur: 2 }}
        title={
          <Text fw={600} size="lg">
            Weekly Availability for {editingService?.name ?? 'this visit service type'}
          </Text>
        }
      >
        {editingService && (
          <ScheduleAvailabilityEditor
            key={editingService.id}
            schedule={schedule}
            service={editingService}
            timezone={getSchedulingTimezone(editingService, schedule, actor)}
            onCancel={editorHandlers.close}
            onSave={(updated) => {
              setSchedule(updated);
              setDirty(true);
              editorHandlers.close();
            }}
          />
        )}
      </Modal>
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
      <Title order={1} mb="sm">
        Schedule Settings
        {schedule?.actor.map((actor, i) => (
          <Fragment key={actor.reference}>
            {i === 0 ? ' - ' : ', '}
            {formatReferenceString(actor)}
          </Fragment>
        ))}
      </Title>
      <ReleaseStageBanner stage="beta" bdrs="md" mb="lg">
        Medplum Scheduling is in a Beta period and is subject to change.
      </ReleaseStageBanner>
      {schedule ? <ScheduleSettings schedule={schedule} key={schedule.id} /> : <Loader />}
    </Document>
  );
}
