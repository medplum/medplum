// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert } from '@mantine/core';
import type { ResourceType } from '@medplum/fhirtypes';
import { Document, PatientTenantsForm, useResource } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useParams } from 'react-router';

export function TenantsPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });

  if (!resource) {
    return null;
  }

  return (
    <Document maw={700}>
      {resource.resourceType === 'Patient' ? (
        <PatientTenantsForm patient={resource} />
      ) : (
        <Alert icon={<IconAlertCircle size={16} />} title="Unsupported resource type" color="red">
          Tenant management is only supported for Patient resources
        </Alert>
      )}
    </Document>
  );
}
