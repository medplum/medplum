// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text } from '@mantine/core';
import { createReference, deepEquals, getDisplayString } from '@medplum/core';
import type { Location, Reference } from '@medplum/fhirtypes';
import { MultiResourceInput } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { LOCATION_SEARCH_CRITERIA } from '../constants';
import { normalizeReference } from './ActorPage/roleDraft';
import { ConfirmModal } from './ConfirmModal';

export interface ServiceFacilitiesFieldProps {
  /** The service facilities named. Empty means every service facility, unless `linked` names some. */
  readonly value: readonly Reference<Location>[];
  readonly onChange: (value: Reference<Location>[]) => void;
  /** The visit type's or provider's name, for the confirmation text. */
  readonly name: string;
  /** Service facilities it is also at, which this field can't edit, so an empty field doesn't mean every one. */
  readonly linked?: readonly Reference<Location>[];
  readonly description?: string;
}

interface PendingChange {
  readonly next: Reference<Location>[];
  /** The first service facility added, by name. Absent when the last ones are being removed. */
  readonly added?: string;
}

/**
 * Edits the service facilities a visit type or provider can be booked at. An empty list means every service
 * facility, so the two edits that cross between empty and not empty are confirmed first.
 * @param props - The service facilities named, a change handler, and the visit type's or provider's name.
 * @returns The field.
 */
export function ServiceFacilitiesField(props: ServiceFacilitiesFieldProps): JSX.Element {
  const { value, onChange, name, linked = [], description } = props;
  const [pending, setPending] = useState<PendingChange>();
  // The input holds its own selection, so it is remounted on `value` whenever the two part: a change the viewer
  // declines, or `value` reset from outside, as Discard does.
  const [inputKey, setInputKey] = useState(0);
  const reported = useRef(value);
  const everywhere = value.length === 0 && linked.length === 0;

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
    const linkedReferences = new Set(linked.flatMap((facility) => normalizeReference(facility.reference) ?? []));
    const picked = locations.filter((location) => !linkedReferences.has(`Location/${location.id}`));
    if (picked.length < locations.length) {
      // A linked service facility is already listed beside the field, so picking it here changes nothing.
      setInputKey((key) => key + 1);
      return;
    }
    const next = picked.map((location) => createReference(location));
    if (linked.length === 0 && value.length === 0 && next.length > 0) {
      setPending({ next, added: getDisplayString(picked[0]) });
    } else if (linked.length === 0 && value.length > 0 && next.length === 0) {
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
        placeholder={everywhere ? 'Offered at every service facility' : 'Add a service facility'}
        searchCriteria={LOCATION_SEARCH_CRITERIA}
        defaultValue={[...value]}
        onChange={handleChange}
      />
      {description && (
        <Text size="xs" c="dimmed">
          {description}
        </Text>
      )}
      <ConfirmModal
        opened={pending !== undefined}
        title={pending && confirmationTitle(pending, name)}
        cancelLabel="Cancel"
        confirmLabel={pending?.added ? `Limit to ${pending.added}` : 'Offer everywhere'}
        onCancel={cancel}
        onConfirm={() => {
          if (pending) {
            report(pending.next);
          }
          setPending(undefined);
        }}
      >
        {pending && confirmationBody(pending, name)}
      </ConfirmModal>
    </Stack>
  );
}

function confirmationTitle(pending: PendingChange, name: string): string {
  return pending.added ? `Offer ${name} only at ${pending.added}?` : `Offer ${name} at every service facility?`;
}

function confirmationBody(pending: PendingChange, name: string): string {
  return pending.added
    ? `${name} is offered at every service facility now. Adding ${pending.added} limits it to ${pending.added} only, once you save.`
    : `That leaves no service facilities listed, which means ${name} is offered at every one of them once you save.`;
}
