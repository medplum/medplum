import { normalizeErrorString } from '@medplum/core';
import { ResourceType } from '@medplum/fhirtypes';
import { Button, useMedplum } from '@medplum/react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';

export interface DeletePageProps {
  resourceType: ResourceType;
  id: string;
}

export function DeletePage(props: DeletePageProps): JSX.Element {
  const { resourceType, id } = props;
  const medplum = useMedplum();
  const navigate = useNavigate();
  return (
    <>
      <p>Are you sure you want to delete this {resourceType}?</p>
      <Button
        danger={true}
        onClick={() => {
          medplum
            .deleteResource(resourceType, id as string)
            .then(() => navigate(`/${resourceType}`))
            .catch((err) => toast.error(normalizeErrorString(err)));
        }}
      >
        Delete
      </Button>
    </>
  );
}
