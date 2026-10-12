// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text } from '@mantine/core';
import { createReference, deepEquals } from '@medplum/core';
import type { Location, Reference } from '@medplum/fhirtypes';
import { MultiResourceInput } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { SERVICE_FACILITY_SEARCH_CRITERIA } from '../constants';
import { normalizeReference } from './ActorPage/roleDraft';

export interface ServiceFacilitiesFieldProps {
  /** The service facilities named. Empty means every service facility, unless `linked` names some. */
  readonly value: readonly Reference<Location>[];
  readonly onChange: (value: Reference<Location>[]) => void;
  /** Service facilities it is also at, which this field can't edit, so an empty field doesn't mean every one. */
  readonly linked?: readonly Reference<Location>[];
  readonly description?: string;
}

/**
 * Edits the service facilities a visit type or provider can be booked at. An empty list means every service
 * facility, which the page confirms on save with `getServiceFacilitiesConfirmation`.
 * @param props - The service facilities named, and a change handler.
 * @returns The field.
 */
export function ServiceFacilitiesField(props: ServiceFacilitiesFieldProps): JSX.Element {
  const { value, onChange, linked = [], description } = props;
  // The input holds its own selection, so it is remounted on `value` whenever the two part: a pick it ignores,
  // or `value` reset from outside, as Discard does.
  const [inputKey, setInputKey] = useState(0);
  const reported = useRef(value);
  const everywhere = value.length === 0 && linked.length === 0;

  useEffect(() => {
    if (!deepEquals(value, reported.current)) {
      reported.current = value;
      setInputKey((key) => key + 1);
    }
  }, [value]);

  function handleChange(locations: Location[]): void {
    const linkedReferences = new Set(linked.flatMap((facility) => normalizeReference(facility.reference) ?? []));
    if (locations.some((location) => linkedReferences.has(`Location/${location.id}`))) {
      // A linked service facility is already listed beside the field, so picking it here changes nothing.
      setInputKey((key) => key + 1);
      return;
    }
    const next = locations.map((location) => createReference(location));
    reported.current = next;
    onChange(next);
  }

  return (
    <Stack gap={4}>
      <MultiResourceInput<Location>
        key={inputKey}
        resourceType="Location"
        name="service-facilities"
        label="Service facilities"
        placeholder={everywhere ? 'Offered at every service facility' : 'Add a service facility'}
        searchCriteria={SERVICE_FACILITY_SEARCH_CRITERIA}
        defaultValue={[...value]}
        onChange={handleChange}
      />
      {description && (
        <Text size="xs" c="dimmed">
          {description}
        </Text>
      )}
    </Stack>
  );
}
