// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Select, SimpleGrid, Stack, Switch, Text, TextInput, Tooltip, VisuallyHidden } from '@mantine/core';
import { capitalize, createReference, getDisplayString } from '@medplum/core';
import type { Location, Practitioner, Reference } from '@medplum/fhirtypes';
import { ResourceInput } from '@medplum/react';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { CSSProperties, JSX, ReactNode } from 'react';
import { useId, useMemo } from 'react';
import { getActorTypeLabel } from '../../actors';
import { LOCATION_SEARCH_CRITERIA, NPI_SYSTEM } from '../../constants';
import { getTimezoneOptions } from '../../SchedulingParametersEditor/SchedulingParametersEditor.utils';
import type { ActorGeneralFields, ActorResource } from './actorDraft';

export interface ActorGeneralProps {
  /** The actor as the page would store it. */
  readonly resource: ActorResource;
  readonly value: ActorGeneralFields;
  readonly onChange: (value: ActorGeneralFields) => void;
  /** Whether the actor's Schedule is active, as edited, or undefined when it has none. */
  readonly scheduleActive: boolean | undefined;
  readonly onScheduleActiveChange: (active: boolean) => void;
  /** Why the name can't be saved, once that should be said. */
  readonly nameError?: string;
}

/**
 * The General section of an actor's page. A provider's name and NPIs are read-only, since the system providers
 * come from keeps them, and where a provider works is recorded on their roles rather than here.
 * @param props - The actor, its fields, and the change handlers.
 * @returns The section's fields.
 */
export function ActorGeneral(props: ActorGeneralProps): JSX.Element {
  const { resource, value, onChange, scheduleActive, onScheduleActiveChange, nameError } = props;
  const typeLabel = getActorTypeLabel(resource.resourceType);
  // Only turning off is allowed while the actor is inactive, so a Schedule stored on can still be switched off.
  const scheduleLocked = !value.active && !scheduleActive;

  function update(change: Partial<ActorGeneralFields>): void {
    onChange({ ...value, ...change });
  }

  const statuses = (
    <FieldGrid>
      <StatusSwitch
        label={`${typeLabel} status`}
        value={statusLabel(resource)}
        checked={value.active}
        onChange={(active) => update({ active })}
      />
      {scheduleActive !== undefined && (
        <StatusSwitch
          label="Schedule status"
          value={scheduleActive ? 'Active' : 'Inactive'}
          checked={scheduleActive}
          onChange={onScheduleActiveChange}
          disabledReason={
            scheduleLocked ? `Can't be switched on while the ${typeLabel.toLowerCase()} is inactive.` : undefined
          }
        />
      )}
    </FieldGrid>
  );

  if (resource.resourceType === 'Practitioner') {
    const npis = getNpis(resource);
    return (
      <>
        {statuses}
        <FieldGrid>
          <ReadOnlyField label="Name" value={getDisplayString(resource)} />
          <ReadOnlyField
            label={npis.length > 1 ? 'NPIs' : 'NPI'}
            value={npis.length > 0 ? npis.join(', ') : undefined}
          />
          <TimezoneField recommended value={value.timezone} onChange={(timezone) => update({ timezone })} />
        </FieldGrid>
      </>
    );
  }

  const isRoom = resource.resourceType === 'Location';
  return (
    <>
      {statuses}
      <FieldGrid>
        <TextInput
          label="Name"
          required
          value={value.name}
          onChange={(event) => update({ name: event.currentTarget.value })}
          error={nameError}
          placeholder={isRoom ? 'e.g. Exam Room 3' : 'e.g. Ultrasound 2'}
        />
        <LocationField
          placeholder={isRoom ? 'Hidden when booking by service facility' : 'Shown at every service facility'}
          value={value.location}
          onChange={(location) => update({ location })}
        />
        <TimezoneField
          description={`Used for this ${typeLabel.toLowerCase()}'s hours unless a visit type sets its own.`}
          value={value.timezone}
          onChange={(timezone) => update({ timezone })}
        />
      </FieldGrid>
    </>
  );
}

function FieldGrid(props: { readonly children: ReactNode }): JSX.Element {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      {props.children}
    </SimpleGrid>
  );
}

function StatusSwitch(props: {
  readonly label: string;
  readonly value: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** Why the switch can't be used. Given, the switch is disabled and the reason shows on hover. */
  readonly disabledReason?: string;
}): JSX.Element {
  const reasonId = useId();
  return (
    <Stack gap={2}>
      <Text size="sm" fw={500}>
        {props.label}
      </Text>
      <Tooltip label={props.disabledReason} disabled={!props.disabledReason} multiline w={280} withArrow>
        {/* A disabled input emits no pointer events, so the tooltip hangs on a wrapper instead. */}
        <Box w="fit-content">
          <Switch
            aria-label={props.label}
            aria-describedby={props.disabledReason ? reasonId : undefined}
            label={props.value}
            checked={props.checked}
            disabled={!!props.disabledReason}
            onChange={(event) => props.onChange(event.currentTarget.checked)}
          />
        </Box>
      </Tooltip>
      {props.disabledReason && <VisuallyHidden id={reasonId}>{props.disabledReason}</VisuallyHidden>}
    </Stack>
  );
}

function getNpis(practitioner: Practitioner): string[] {
  return (practitioner.identifier ?? []).flatMap((identifier) =>
    identifier.system === NPI_SYSTEM && identifier.value ? [identifier.value] : []
  );
}

// A room's or device's other statuses, like suspended, read as on and are kept until switched.
function statusLabel(resource: ActorResource): string {
  if (resource.resourceType === 'Practitioner') {
    return resource.active === false ? 'Inactive' : 'Active';
  }
  return resource.status ? capitalize(resource.status) : 'Active';
}

const WARNING_INPUT = { '--input-bd': 'var(--mantine-color-yellow-6)' } as CSSProperties;

function TimezoneField(props: {
  readonly description?: string;
  /** Left empty, the field is marked with a warning that does not block saving. */
  readonly recommended?: boolean;
  readonly value: string | undefined;
  readonly onChange: (value: string | undefined) => void;
}): JSX.Element {
  const { description, recommended, value, onChange } = props;
  const options = useMemo(() => getTimezoneOptions([value]), [value]);
  const warn = recommended && !value;
  return (
    <Select
      label="Time zone"
      description={
        warn ? (
          <>
            <IconAlertTriangle size={12} style={{ verticalAlign: 'text-bottom' }} /> Recommended for scheduling.
          </>
        ) : (
          description
        )
      }
      descriptionProps={warn ? { c: 'yellow.8' } : undefined}
      styles={warn ? { wrapper: WARNING_INPUT } : undefined}
      inputWrapperOrder={['label', 'input', 'description', 'error']}
      data={options}
      value={value ?? null}
      placeholder="Not set"
      onChange={(next) => onChange(next ?? undefined)}
      searchable
      clearable
      comboboxProps={{ keepMounted: false }}
      clearButtonProps={{ 'aria-label': 'Clear time zone' }}
      nothingFoundMessage="No matching time zone"
    />
  );
}

interface LocationFieldProps {
  readonly placeholder: string;
  readonly value: Reference<Location> | undefined;
  readonly onChange: (value: Reference<Location> | undefined) => void;
}

/**
 * Picks one of the service facilities booking's site filter offers.
 * @param props - What to show when blank, the Location referenced, and a change handler.
 * @returns The field.
 */
function LocationField(props: LocationFieldProps): JSX.Element {
  const { placeholder, value, onChange } = props;
  return (
    <ResourceInput<Location>
      resourceType="Location"
      name="service-facility"
      label="Service facility"
      placeholder={placeholder}
      searchCriteria={LOCATION_SEARCH_CRITERIA}
      defaultValue={value}
      onChange={(location) => onChange(location && createReference(location))}
    />
  );
}

// A label over a value, or over "Not set" when there is none.
function ReadOnlyField(props: { readonly label: string; readonly value?: string }): JSX.Element {
  return (
    <Stack gap={2}>
      <Text size="sm" fw={500}>
        {props.label}
      </Text>
      <Text size="sm" c={props.value === undefined ? 'dimmed' : undefined}>
        {props.value ?? 'Not set'}
      </Text>
    </Stack>
  );
}
