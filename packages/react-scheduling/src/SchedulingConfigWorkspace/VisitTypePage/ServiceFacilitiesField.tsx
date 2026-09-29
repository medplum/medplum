// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { createReference, deepEquals, getDisplayString } from '@medplum/core';
import type { Location, Reference } from '@medplum/fhirtypes';
import { MultiResourceInput } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { LOCATION_SEARCH_CRITERIA } from '../../constants';

export interface ServiceFacilitiesFieldProps {
  /** The service facilities the visit type names. Empty means every service facility. */
  readonly value: readonly Reference<Location>[];
  readonly onChange: (value: Reference<Location>[]) => void;
  /** The visit type's name, for the confirmation text. */
  readonly serviceName: string;
}

interface PendingChange {
  readonly next: Reference<Location>[];
  /** The first service facility added, by name. Absent when the last ones are being removed. */
  readonly added?: string;
}

/**
 * Edits the service facilities a visit type can be booked at, `HealthcareService.location`. An empty list
 * means every service facility, so the two edits that cross between empty and not empty are confirmed first.
 * @param props - The service facilities named, a change handler, and the visit type's name.
 * @returns The field.
 */
export function ServiceFacilitiesField(props: ServiceFacilitiesFieldProps): JSX.Element {
  const { value, onChange, serviceName } = props;
  const [pending, setPending] = useState<PendingChange>();
  // The input holds its own selection, so it is remounted on `value` whenever the two part: a change the viewer
  // declines, or `value` reset from outside, as Discard does.
  const [inputKey, setInputKey] = useState(0);
  const reported = useRef(value);

  useEffect(() => {
    if (!deepEquals(value, reported.current)) {
      reported.current = value;
      setInputKey((key) => key + 1);
    }
  }, [value]);

  function report(next: Reference<Location>[]): void {
    reported.current = next;
    onChange(next);
  }

  function handleChange(locations: Location[]): void {
    const next = locations.map((location) => createReference(location));
    if (value.length === 0 && next.length > 0) {
      setPending({ next, added: getDisplayString(locations[0]) });
    } else if (value.length > 0 && next.length === 0) {
      setPending({ next });
    } else {
      report(next);
    }
  }

  function cancel(): void {
    setPending(undefined);
    setInputKey((key) => key + 1);
  }

  return (
    <Stack gap={4}>
      <MultiResourceInput<Location>
        key={inputKey}
        resourceType="Location"
        name="service-facilities"
        label="Service facilities"
        placeholder={value.length === 0 ? 'Offered at every service facility' : 'Add a service facility'}
        searchCriteria={LOCATION_SEARCH_CRITERIA}
        defaultValue={[...value]}
        onChange={handleChange}
      />
      <Text size="xs" c="dimmed">
        Booking filtered to a service facility offers this visit type only if it's listed here, or if none are.
      </Text>
      <Modal
        opened={pending !== undefined}
        onClose={cancel}
        title={pending && confirmationTitle(pending, serviceName)}
        centered
      >
        {pending && (
          <Stack gap="md">
            <Text size="sm">{confirmationBody(pending, serviceName)}</Text>
            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={cancel}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  report(pending.next);
                  setPending(undefined);
                }}
              >
                {pending.added ? `Limit to ${pending.added}` : 'Offer everywhere'}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}

function confirmationTitle(pending: PendingChange, serviceName: string): string {
  return pending.added
    ? `Offer ${serviceName} only at ${pending.added}?`
    : `Offer ${serviceName} at every service facility?`;
}

function confirmationBody(pending: PendingChange, serviceName: string): string {
  return pending.added
    ? `${serviceName} is offered at every service facility now. Adding ${pending.added} limits it to ${pending.added} only, once you save.`
    : `That leaves no service facilities listed, which means ${serviceName} is offered at every one of them once you save.`;
}
