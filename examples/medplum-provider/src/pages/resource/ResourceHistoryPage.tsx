// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ResourceType } from '@medplum/fhirtypes';
import { ResourceHistoryTable } from '@medplum/react';
import { JSX } from 'react';
import { useParams } from 'react-router';

export function ResourceHistoryPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType | undefined; id: string | undefined };

  if (!resourceType || !id) {
    return null;
  }

  return <ResourceHistoryTable key={`${resourceType}/${id}`} resourceType={resourceType} id={id} />;
}
