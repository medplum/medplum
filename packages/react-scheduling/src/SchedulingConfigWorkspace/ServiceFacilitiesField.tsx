// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Pill, Stack, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import { createReference, deepEquals } from '@medplum/core';
import type { Location, Reference } from '@medplum/fhirtypes';
import { MultiResourceInput } from '@medplum/react';
import { IconLock } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { SERVICE_FACILITY_SEARCH_CRITERIA } from '../constants';
import classes from './ServiceFacilitiesField.module.css';

export interface ServiceFacilitiesFieldProps {
  /** The service facilities named. Empty means every service facility, unless `linked` names some. */
  readonly value: readonly Reference<Location>[];
  readonly onChange: (value: Reference<Location>[]) => void;
  /**
   * Service facilities it is also at, each named, which this field shows locked and can't edit, so an empty
   * field doesn't mean every one.
   */
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
    const linkedReferences = new Set(linked.flatMap((facility) => facility.reference ?? []));
    if (locations.some((location) => linkedReferences.has(`Location/${location.id}`))) {
      // A linked service facility is already listed above the input, so picking it here changes nothing.
      setInputKey((key) => key + 1);
      return;
    }
    const next = locations.map((location) => createReference(location));
    reported.current = next;
    onChange(next);
  }

  return (
    <Stack gap={4} className={linked.length > 0 ? classes.sharedLabel : undefined}>
      {/* Linked ones go above the input, so its open dropdown can't cover them, under the one visible label. */}
      {linked.length > 0 && (
        <>
          <Text size="sm" fw={500} aria-hidden>
            Service facilities
          </Text>
          <LinkedFacilities facilities={linked} />
        </>
      )}
      <MultiResourceInput<Location>
        key={inputKey}
        resourceType="Location"
        name="service-facilities"
        label={linked.length > 0 ? <VisuallyHidden>Service facilities</VisuallyHidden> : 'Service facilities'}
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

function LinkedFacilities(props: { readonly facilities: readonly Reference<Location>[] }): JSX.Element {
  const captionId = useId();
  return (
    <Group gap={6} mb={4}>
      <Group gap={6} role="list" aria-labelledby={captionId}>
        {props.facilities.map((facility) => {
          const name = facility.display ?? facility.reference ?? 'Unnamed service facility';
          const description = `Another system linked ${name}, so it can't be removed here.`;
          return (
            <Tooltip key={facility.reference} label={description} multiline maw={280} withArrow>
              <Pill role="listitem">
                <Group gap={4} wrap="nowrap">
                  <IconLock size={12} aria-hidden />
                  {name}
                  <VisuallyHidden>: {description}</VisuallyHidden>
                </Group>
              </Pill>
            </Tooltip>
          );
        })}
      </Group>
      <Text size="xs" c="dimmed" id={captionId}>
        Linked by another system
      </Text>
    </Group>
  );
}
