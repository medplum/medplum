// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { createReference, deepEquals, getDisplayString } from '@medplum/core';
import type { Location, Reference } from '@medplum/fhirtypes';
import { ResourceInput } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LOCATION_SEARCH_CRITERIA } from '../../constants';
import { getTimezoneOptions } from '../../SchedulingParametersEditor/SchedulingParametersEditor.utils';
import type { ActorGeneralFields, ActorResource } from './actorDraft';

export interface ActorGeneralProps {
  /** The actor as the page would store it. */
  readonly resource: ActorResource;
  readonly value: ActorGeneralFields;
  readonly onChange: (value: ActorGeneralFields) => void;
  /** The actor hasn't been saved yet. */
  readonly creating: boolean;
  /** Why the name can't be saved, once that should be said. */
  readonly nameError?: string;
}

const STATUSES = ['active', 'inactive'];

/**
 * The General section of an actor's page. A provider's name and status are read-only, since they are kept by
 * whatever system the provider comes from, and only the time zone is edited. A room's or device's name,
 * status, and location are edited too.
 * @param props - The actor, its fields, and a change handler.
 * @returns The section's fields.
 */
export function ActorGeneral(props: ActorGeneralProps): JSX.Element {
  const { resource, value, onChange, creating, nameError } = props;

  function update(change: Partial<ActorGeneralFields>): void {
    onChange({ ...value, ...change });
  }

  if (resource.resourceType === 'Practitioner') {
    return (
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <ReadOnlyField label="Name" value={getDisplayString(resource)} />
          <ReadOnlyField label="Status" value={resource.active === false ? 'Inactive' : 'Active'} />
        </SimpleGrid>
        <TimezoneField value={value.timezone} onChange={(timezone) => update({ timezone })} />
      </Stack>
    );
  }

  const noun = resource.resourceType === 'Location' ? 'room' : 'device';
  return (
    <Stack gap="md">
      <TextInput
        label="Name"
        required
        value={value.name}
        onChange={(event) => update({ name: event.currentTarget.value })}
        error={nameError}
        placeholder={noun === 'room' ? 'e.g. Exam Room 3' : 'e.g. Ultrasound 2'}
      />
      {!creating && (
        <Select
          label="Status"
          description={`Inactive hides this ${noun} from the list. Existing appointments are kept.`}
          inputWrapperOrder={['label', 'input', 'description', 'error']}
          data={statusOptions(value.status)}
          value={value.status ?? null}
          placeholder="Not set"
          onChange={(next) => update({ status: next ?? undefined })}
          allowDeselect={false}
        />
      )}
      <LocationField
        label={noun === 'room' ? 'Service facility' : 'Location'}
        value={value.location}
        onChange={(location) => update({ location })}
      />
      <TimezoneField
        description={`Used for this ${noun}'s hours unless a visit type sets its own.`}
        value={value.timezone}
        onChange={(timezone) => update({ timezone })}
      />
    </Stack>
  );
}

function statusOptions(stored: string | undefined): { value: string; label: string }[] {
  const values = stored && !STATUSES.includes(stored) ? [...STATUSES, stored] : STATUSES;
  return values.map((status) => ({ value: status, label: status.charAt(0).toUpperCase() + status.slice(1) }));
}

function TimezoneField(props: {
  readonly description?: string;
  readonly value: string | undefined;
  readonly onChange: (value: string | undefined) => void;
}): JSX.Element {
  const { description, value, onChange } = props;
  const options = useMemo(() => getTimezoneOptions([value]), [value]);
  return (
    <Select
      label="Time zone"
      description={description}
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
  readonly label: string;
  readonly value: Reference<Location> | undefined;
  readonly onChange: (value: Reference<Location> | undefined) => void;
}

/**
 * Picks one of the service facilities booking's site filter offers.
 * @param props - The label, the Location referenced, and a change handler.
 * @returns The field.
 */
function LocationField(props: LocationFieldProps): JSX.Element {
  const { label, value, onChange } = props;
  // The input holds its own selection, so it is remounted when `value` is reset from outside, as Discard does.
  const [inputKey, setInputKey] = useState(0);
  const reported = useRef(value);

  useEffect(() => {
    if (!deepEquals(value, reported.current)) {
      reported.current = value;
      setInputKey((key) => key + 1);
    }
  }, [value]);

  return (
    <ResourceInput<Location>
      key={inputKey}
      resourceType="Location"
      name={label.toLowerCase().replace(' ', '-')}
      label={label}
      placeholder="Not set"
      searchCriteria={LOCATION_SEARCH_CRITERIA}
      defaultValue={value}
      onChange={(location) => {
        const next = location && createReference(location);
        reported.current = next;
        onChange(next);
      }}
    />
  );
}

function ReadOnlyField(props: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <Stack gap={2}>
      <Text size="sm" fw={500}>
        {props.label}
      </Text>
      <Text size="sm">{props.value}</Text>
    </Stack>
  );
}
