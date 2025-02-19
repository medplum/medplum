import { Alert } from '@mantine/core';
import { ResourceType } from '@medplum/fhirtypes';
import { Document, PatientExportForm, useResource } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { useParams } from 'react-router-dom';

export function ExportPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });

  if (!resource) {
    return null;
  }

  return (
    <Document maw={600}>
      {resource.resourceType === 'Patient' ? (
        <PatientExportForm patient={resource} />
      ) : (
        <Alert icon={<IconAlertCircle size={16} />} title="Unsupported export type" color="red">
          This page is only supported for Patient resources
        </Alert>
      )}
    </Document>
  );
}
