// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, CloseButton, Group, Loader, Paper, Stack, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import { createReference, normalizeErrorString } from '@medplum/core';
import type { Location, Reference } from '@medplum/fhirtypes';
import { ResourceInput } from '@medplum/react';
import { IconLock } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { LOCATION_SEARCH_CRITERIA } from '../../constants';
import { ConfigSection } from '../ConfigPage/ConfigPage';
import { normalizeReference } from '../serviceFacilities';

export interface ServiceFacilitiesSectionProps {
  readonly actorName: string;
  /** The service facilities as edited, each named. Absent while the provider's roles are read. */
  readonly value?: readonly Reference<Location>[];
  /** The service facilities another system linked, by `Location/id`, which can't be removed here. */
  readonly locked: ReadonlySet<string>;
  /** Why the provider's roles could not be read, when they couldn't. */
  readonly error?: unknown;
  readonly onChange: (value: Reference<Location>[]) => void;
}

/**
 * The service facilities a provider works at, which booking filtered to a service facility offers them at.
 * @param props - The service facilities, which of them are locked, and a change handler.
 * @returns The section.
 */
export function ServiceFacilitiesSection(props: ServiceFacilitiesSectionProps): JSX.Element {
  const { actorName, value, locked, error, onChange } = props;
  // The picker holds its own selection, so it is remounted to clear it once a pick is listed.
  const [pickerKey, setPickerKey] = useState(0);

  function add(location: Location | undefined): void {
    setPickerKey((key) => key + 1);
    if (!location || !value || value.some((facility) => sameFacility(facility, location))) {
      return;
    }
    onChange([...value, createReference(location)]);
  }

  function remove(removed: Reference<Location>): void {
    onChange((value ?? []).filter((facility) => facility !== removed));
  }

  let body: JSX.Element;
  if (error) {
    body = <Alert color="red">Service facilities could not be loaded: {normalizeErrorString(error)}</Alert>;
  } else if (!value) {
    body = <Loader size="sm" aria-label="Loading service facilities" />;
  } else {
    body = (
      <>
        {value.length === 0 ? (
          <Text size="sm" c="dimmed">
            No service facilities. When booking filters by service facility, {actorName} is offered at every one.
          </Text>
        ) : (
          <Stack gap="xs">
            {value.map((facility) => {
              const name = facility.display ?? facility.reference ?? 'Unnamed service facility';
              return (
                <Paper key={facility.reference} withBorder radius="sm" px="sm" py={6}>
                  <Group justify="space-between" wrap="nowrap" mih={28}>
                    <Text size="sm">{name}</Text>
                    {locked.has(normalizeReference(facility.reference) ?? '') ? (
                      <LockedBadge name={name} />
                    ) : (
                      <CloseButton size="sm" aria-label={`Remove ${name}`} onClick={() => remove(facility)} />
                    )}
                  </Group>
                </Paper>
              );
            })}
          </Stack>
        )}
        <ResourceInput<Location>
          key={pickerKey}
          resourceType="Location"
          name="add-service-facility"
          label="Add a service facility"
          placeholder="Search service facilities"
          searchCriteria={LOCATION_SEARCH_CRITERIA}
          onChange={add}
        />
      </>
    );
  }

  return <ConfigSection title="Service facilities">{body}</ConfigSection>;
}

function LockedBadge(props: { readonly name: string }): JSX.Element {
  const description = `Another system linked ${props.name}, so it can't be removed here.`;
  return (
    <Tooltip label={description} multiline maw={280} withArrow>
      <Badge size="sm" variant="light" color="gray" leftSection={<IconLock size={12} />}>
        Locked
        <VisuallyHidden>: {description}</VisuallyHidden>
      </Badge>
    </Tooltip>
  );
}

function sameFacility(facility: Reference<Location>, location: Location): boolean {
  return normalizeReference(facility.reference) === `Location/${location.id}`;
}
