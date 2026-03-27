// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert } from '@mantine/core';
import type { ResourceType } from '@medplum/fhirtypes';
import { Document, PatientAccountsForm, useResource } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';

export function AccountsPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });
  const navigate = useNavigate();

  const handleSaved = useCallback(() => {
    // Navigate to the same page to force a full re-fetch of the Patient resource
    navigate(0)?.catch(console.error);
  }, [navigate]);

  if (!resource) {
    return null;
  }

  return (
    <Document maw={700}>
      {resource.resourceType === 'Patient' ? (
        <PatientAccountsForm patient={resource} onSaved={handleSaved} />
      ) : (
        <Alert icon={<IconAlertCircle size={16} />} title="Unsupported resource type" color="red">
          Account management is only supported for Patient resources
        </Alert>
      )}
    </Document>
  );
}
