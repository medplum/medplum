// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Title } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import { ResourceTable, useResource } from '@medplum/react';
import { JSX } from 'react';
import { useParams } from 'react-router';

/**
 * This is an example of a generic "Resource Display" page.
 * It uses the Medplum `<ResourceTable>` component to display a resource.
 * @returns A React component that displays a resource.
 */
export function ResourceDetailPage(): JSX.Element | null {
  const { resourceType, id } = useParams();
  const resource = useResource({ reference: resourceType + '/' + id });

  if (!resource) {
    return null;
  }

  return (
    <Stack>
      <Title>{getDisplayString(resource)}</Title>
      <ResourceTable key={`${resourceType}/${id}`} value={resource} />
    </Stack>
  );
}
