// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ResourceType } from '@medplum/fhirtypes';
import { Document, Loading, ResourceTable, useResource } from '@medplum/react';
import type { JSX } from 'react';
import { useParams } from 'react-router';

export function ResourceDetailsPage(): JSX.Element {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });

  if (!resource) {
    return <Loading />;
  }

  return (
    <Document>
      <ResourceTable value={resource} />
    </Document>
  );
}
