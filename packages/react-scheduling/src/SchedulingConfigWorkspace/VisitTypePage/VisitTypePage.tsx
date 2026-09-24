// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Group, Stack, Switch, Text, TextInput, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { deepClone, deepEquals, normalizeErrorString } from '@medplum/core';
import type { HealthcareService, Location, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useId, useState } from 'react';
import type { SchedulingParameterValues } from '../../parameterValues';
import {
  getHealthcareServiceSchedulingParameterValues,
  SCHEDULING_PARAMETER_DEFAULTS,
  setHealthcareServiceSchedulingParameterValues,
} from '../../parameterValues';
import type { AvailabilityFieldsValue } from '../../ScheduleAvailabilityEditor/ScheduleAvailabilityEditor.utils';
import {
  blankWeeklyAvailability,
  DEFAULT_RANGE,
  fromWeeklyAvailability,
  getAvailabilityFieldsError,
  initialAvailabilityFieldsValue,
} from '../../ScheduleAvailabilityEditor/ScheduleAvailabilityEditor.utils';
import { ScheduleAvailabilityFields } from '../../ScheduleAvailabilityEditor/ScheduleAvailabilityFields';
import {
  getBlockingErrors,
  getSchedulingParameterWarnings,
  getVisibleParameters,
  validateSchedulingParameters,
} from '../../SchedulingParametersEditor/SchedulingParametersEditor.utils';
import { SchedulingParametersFields } from '../../SchedulingParametersEditor/SchedulingParametersFields';
import { ConfigSection, SaveBar } from '../ConfigPage/ConfigPage';
import type { ConfigSaveFailure } from '../ConfigPage/configSave';
import { saveConfigChanges } from '../ConfigPage/configSave';
import { ParameterWarnings } from '../ConfigPage/ParameterWarnings';
import type { ConfigOffering } from '../SchedulingConfigWorkspace.utils';
import { OfferedBySection } from './OfferedBySection';
import { ServiceFacilitiesField } from './ServiceFacilitiesField';

export interface VisitTypePageProps {
  /** The visit type as stored. Omitted to create one. */
  readonly service?: WithId<HealthcareService>;
  /** Called with the visit type as the server now holds it: after a save, or after reloading a newer version. */
  readonly onStored: (service: WithId<HealthcareService>) => void;
  /** Called when a visit type that was being created is discarded instead. */
  readonly onDiscardNew?: () => void;
  /** Called whenever the page starts or stops holding unsaved changes. */
  readonly onDirtyChange?: (dirty: boolean) => void;
  /** Every provider, room, and device whose calendar offers the visit type. */
  readonly offerings?: readonly ConfigOffering[];
  /** What offers the visit type is still being read. */
  readonly offeringsLoading?: boolean;
  /** Opens the page of an actor offering the visit type. */
  readonly onOpenOffering?: (offering: ConfigOffering) => void;
}

interface VisitTypeFields {
  readonly name: string;
  readonly active: boolean;
  readonly location: Reference<Location>[];
  readonly parameters: SchedulingParameterValues;
  readonly availability: AvailabilityFieldsValue;
}

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;

function fieldsOf(service: WithId<HealthcareService> | undefined): VisitTypeFields {
  if (!service) {
    // Turned off so it isn't bookable before it's finished, and on weekday hours because an empty week can't
    // be saved.
    const weekly = blankWeeklyAvailability();
    for (const day of WEEKDAYS) {
      weekly[day] = { available: true, ranges: [{ ...DEFAULT_RANGE }] };
    }
    return { name: '', active: false, location: [], parameters: {}, availability: { overriding: true, weekly } };
  }
  return {
    name: service.name ?? '',
    active: service.active !== false,
    location: service.location ?? [],
    parameters: getHealthcareServiceSchedulingParameterValues(service),
    availability: initialAvailabilityFieldsValue(service),
  };
}

/**
 * Builds the visit type to store from what the page holds. Only what was edited is rewritten, so opening a
 * visit type and saving one field leaves the rest of it exactly as another tool wrote it.
 * @param stored - The visit type as stored, or undefined for a new one.
 * @param fields - What the page holds.
 * @param initial - What the page opened with.
 * @returns The visit type to store.
 */
function buildVisitType(
  stored: WithId<HealthcareService> | undefined,
  fields: VisitTypeFields,
  initial: VisitTypeFields
): HealthcareService {
  const creating = !stored;
  let draft: HealthcareService = stored ? deepClone(stored) : { resourceType: 'HealthcareService' };
  if (creating || fields.name !== initial.name) {
    draft.name = fields.name.trim();
  }
  if (creating || fields.active !== initial.active) {
    draft.active = fields.active;
  }
  if (!deepEquals(fields.location, initial.location)) {
    if (fields.location.length > 0) {
      draft.location = fields.location;
    } else {
      delete draft.location;
    }
  }
  if (creating || !deepEquals(fields.parameters, initial.parameters)) {
    draft = setHealthcareServiceSchedulingParameterValues(draft, fields.parameters);
  }
  if (creating || !deepEquals(fields.availability, initial.availability)) {
    draft.availableTime = fromWeeklyAvailability(fields.availability.weekly);
  }
  return draft;
}

/**
 * The page for one visit type (`HealthcareService`): its name, whether it is active, the service facilities
 * it is offered at, its scheduling parameters, and its default weekly hours, edited in place and saved together.
 *
 * It opens on what is stored and is not reset by a change of props, so the caller remounts it with a `key`
 * when the visit type it shows is replaced.
 * @param props - The visit type, or nothing to create one, and what to do once it is stored or discarded.
 * @returns The page.
 */
export function VisitTypePage(props: VisitTypePageProps): JSX.Element {
  const { service, onStored, onDiscardNew, onDirtyChange, offerings = [], offeringsLoading, onOpenOffering } = props;
  const medplum = useMedplum();
  const creating = !service;
  const [initial] = useState(() => fieldsOf(service));
  const [fields, setFields] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [triedToSave, setTriedToSave] = useState(false);
  const [failure, setFailure] = useState<Pick<ConfigSaveFailure, 'conflict' | 'message'>>();
  const [reloading, setReloading] = useState(false);
  const fieldIdPrefix = useId();

  const availabilityChanged = !deepEquals(fields.availability, initial.availability);
  // Judged on what would be stored rather than on the fields, so an edit that changes nothing stored, such as a
  // trailing space on the name, doesn't offer a Save that sends nothing.
  const draft = buildVisitType(service, fields, initial);
  const dirty = creating || !deepEquals(draft, service);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const serviceName = fields.name.trim() || initial.name || 'this visit type';
  // The weekly fields read only the name and the stored hours, which a new visit type doesn't have yet.
  const displayService: WithId<HealthcareService> = {
    resourceType: 'HealthcareService',
    id: service?.id ?? '',
    name: serviceName,
    availableTime: service?.availableTime,
  };

  const nameError = fields.name.trim() ? undefined : 'A name is required.';
  // Only edited fields block, so a value stored out of range can't lock anyone out of the page.
  const parameterErrors = getBlockingErrors(
    validateSchedulingParameters(fields.parameters),
    fields.parameters,
    initial.parameters
  );
  const availabilityError =
    creating || availabilityChanged
      ? getAvailabilityFieldsError(fields.availability, displayService, 'service')
      : undefined;
  let blockedReason: string | undefined;
  if (nameError) {
    blockedReason = nameError;
  } else if (Object.keys(parameterErrors).length > 0) {
    blockedReason = 'Fix the highlighted fields before saving.';
  } else {
    blockedReason = availabilityError;
  }

  const warnings = getSchedulingParameterWarnings(fields.parameters, initial.parameters);
  const timezone = fields.parameters.timezone;

  function update(change: Partial<VisitTypeFields>): void {
    setFields((current) => ({ ...current, ...change }));
  }

  async function handleSave(): Promise<void> {
    if (blockedReason) {
      setTriedToSave(true);
      return;
    }
    setSaving(true);
    setFailure(undefined);
    try {
      const result = await saveConfigChanges(medplum, [{ stored: service, draft }]);
      const [stored] = result.saved;
      if (stored) {
        onStored(stored.resource as WithId<HealthcareService>);
      } else {
        setFailure(result.failures[0]);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard(): void {
    if (creating) {
      onDiscardNew?.();
      return;
    }
    setFields(initial);
    setTriedToSave(false);
    setFailure(undefined);
  }

  async function handleReload(): Promise<void> {
    if (!service) {
      return;
    }
    setReloading(true);
    try {
      onStored(await medplum.readResource('HealthcareService', service.id, { cache: 'no-cache' }));
    } catch (err) {
      setFailure({ conflict: false, message: `Could not reload it: ${normalizeErrorString(err)}` });
    } finally {
      setReloading(false);
    }
  }

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          {creating ? 'New visit type' : 'Visit type'}
        </Text>
        <Group gap="sm">
          <Title order={2}>{service?.name ?? (fields.name.trim() || 'Untitled visit type')}</Title>
          {creating && (
            <Badge variant="light" color="blue">
              Not saved yet
            </Badge>
          )}
        </Group>
      </Stack>

      {creating && (
        <Alert color="blue" variant="light">
          Nothing is created until you press Create. It starts turned off, so it can't be booked until you switch Active
          on.
        </Alert>
      )}

      {failure?.conflict && (
        <Alert color="orange" title={`${initial.name || 'This visit type'} changed since you opened it`}>
          <Stack gap="sm" align="flex-start">
            <Text size="sm">
              A newer version was saved somewhere else, so nothing here was written over it. Reload to see the latest
              version. Your changes on this page will be discarded.
            </Text>
            <Button size="xs" variant="light" color="orange" loading={reloading} onClick={handleReload}>
              Reload
            </Button>
          </Stack>
        </Alert>
      )}
      {failure && !failure.conflict && (
        <Alert color="red" title="Not saved">
          {failure.message}
        </Alert>
      )}

      <ConfigSection title="General">
        <TextInput
          label="Name"
          required
          value={fields.name}
          onChange={(event) => update({ name: event.currentTarget.value })}
          error={triedToSave || initial.name ? nameError : undefined}
          placeholder="e.g. Initial Visit"
        />
        <Stack gap={4}>
          <Switch
            label="Active"
            checked={fields.active}
            onChange={(event) => update({ active: event.currentTarget.checked })}
          />
          <Text size="xs" c="dimmed">
            Turning this off stops new bookings. Existing appointments are untouched.
          </Text>
        </Stack>
        <ServiceFacilitiesField
          value={fields.location}
          onChange={(location) => update({ location })}
          serviceName={serviceName}
        />
      </ConfigSection>

      <ConfigSection
        title="Scheduling parameters"
        description="What every calendar offering this visit type follows unless it sets its own. Empty fields use scheduling's default."
      >
        <SchedulingParametersFields
          values={fields.parameters}
          defaults={SCHEDULING_PARAMETER_DEFAULTS}
          defaultLabels={{}}
          errors={parameterErrors}
          idPrefix={fieldIdPrefix}
          onChange={(parameters) => update({ parameters })}
          visible={getVisibleParameters('service', initial.parameters)}
        />
        <ParameterWarnings warnings={warnings} />
      </ConfigSection>

      <ConfigSection
        title="Default availability"
        description="The weekly hours every calendar offering this visit type follows unless it sets custom hours."
      >
        <ScheduleAvailabilityFields
          service={displayService}
          mode="service"
          value={fields.availability}
          onChange={(availability) => update({ availability })}
          timezone={timezone}
        />
        {!timezone && (
          <Text size="sm" c="dimmed">
            This visit type sets no time zone, so each calendar reads these hours in its own time zone.
          </Text>
        )}
        {triedToSave && availabilityError && (
          <Text size="sm" c="red">
            {availabilityError}
          </Text>
        )}
      </ConfigSection>

      <ConfigSection
        title="Offered by"
        description="The providers, rooms, and devices whose calendars offer this visit type. Pick one to change what it offers."
      >
        <OfferedBySection
          service={service}
          serviceName={serviceName}
          location={fields.location}
          offerings={offerings}
          loading={offeringsLoading}
          onOpen={onOpenOffering}
        />
      </ConfigSection>

      <SaveBar
        dirty={dirty}
        message={creating ? 'New visit type, not created yet' : undefined}
        saveLabel={creating ? 'Create' : undefined}
        saving={saving}
        blockedReason={blockedReason}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </Stack>
  );
}
