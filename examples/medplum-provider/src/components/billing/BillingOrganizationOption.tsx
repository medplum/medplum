// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Text } from '@mantine/core';
import { formatAddress } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { ResourceAvatar } from '@medplum/react';
import type { JSX } from 'react';

/**
 * An Organization in a billing settings autocomplete: its avatar and name, with its first address underneath
 * to tell same-named organizations apart.
 * @param props - The BillingOrganizationOption React props.
 * @returns The BillingOrganizationOption React node.
 */
export function BillingOrganizationOption(props: AsyncAutocompleteOption<Organization>): JSX.Element {
  const { label, resource } = props;
  const address = resource.address?.[0];
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
