// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ResourceType } from '@medplum/fhirtypes';
import { Document, ResourceHistoryTable, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useParams } from 'react-router';

export function ResourceHistoryTab(): JSX.Element {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const history = medplum.readHistory(resourceType, id).read();

  return (
    <Document>
      <ResourceHistoryTable history={history} />
    </Document>
  );
}
