import { Button } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { ResourceType } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import React from 'react';
import { useNavigate } from 'react-router-dom';

export interface DeletePageProps {
  resourceType: ResourceType;
  id: string;
}

export function DeletePage(props: DeletePageProps): JSX.Element {
  const { resourceType, id } = props;
  const medplum = useMedplum();
  const navigate = useNavigate();
  return (
    <Document>
      <p>Are you sure you want to delete this {resourceType}?</p>
      <Button
        color="red"
        onClick={() => {
          medplum
            .deleteResource(resourceType, id as string)
            .then(() => navigate(`/${resourceType}`))
            .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
        }}
      >
        Delete
      </Button>
    </Document>
  );
}
