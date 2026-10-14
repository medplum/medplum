// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Text } from '@mantine/core';
import { formatAddress } from '@medplum/core';
import type { Location } from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { ResourceAvatar } from '@medplum/react';
import type { JSX } from 'react';

/**
 * A Location in the service facility autocomplete: its avatar and name, with its address underneath
 * to tell same-named locations apart.
 * @param props - The ServiceFacilityOption React props.
 * @returns The ServiceFacilityOption React node.
 */
export function ServiceFacilityOption(props: AsyncAutocompleteOption<Location>): JSX.Element {
  const { label, resource } = props;
  const address = resource.address;
  return (
    <Group wrap="nowrap">
      <ResourceAvatar value={resource} />
      <div>
        <Text>{label}</Text>
        {address && (
          <Text size="xs" c="dimmed">
            {formatAddress(address)}
          </Text>
        )}
      </div>
    </Group>
  );
}
