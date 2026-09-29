// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Group, Loader, Pill, Stack, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import type { Location, Reference } from '@medplum/fhirtypes';
import { IconLock } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useId } from 'react';
import { ServiceFacilitiesField } from '../ServiceFacilitiesField';

export interface ProviderFacilitiesFieldsProps {
  readonly actorName: string;
  /** The service facilities the workspace may edit, as edited. Absent while the provider's roles are read. */
  readonly value?: readonly Reference<Location>[];
  /** The service facilities another system linked, each named, which can't be removed here. */
  readonly linked: readonly Reference<Location>[];
  /** Why the provider's roles could not be read, when they couldn't. */
  readonly error?: unknown;
  readonly onChange: (value: Reference<Location>[]) => void;
}

/**
 * The service facilities a provider works at: those the workspace may edit, and those another system linked.
 * @param props - The service facilities, the linked ones, and a change handler.
 * @returns The fields.
 */
export function ProviderFacilitiesFields(props: ProviderFacilitiesFieldsProps): JSX.Element {
  const { actorName, value, linked, error, onChange } = props;
  if (error) {
    return <Alert color="red">Service facilities could not be loaded: {normalizeErrorString(error)}</Alert>;
  }
  if (!value) {
    return <Loader size="sm" aria-label="Loading service facilities" />;
  }
  return (
    <>
      <ServiceFacilitiesField value={value} onChange={onChange} name={actorName} linked={linked} />
      {linked.length > 0 && <LinkedFacilities facilities={linked} />}
    </>
  );
}

function LinkedFacilities(props: { readonly facilities: readonly Reference<Location>[] }): JSX.Element {
  const labelId = useId();
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500} id={labelId}>
        Linked by another system
      </Text>
      <Group gap={6} role="list" aria-labelledby={labelId}>
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
    </Stack>
  );
}
