import { Modal, Text } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { ResourceForm, useMedplum } from '@medplum/react';
import { useLocation, useNavigate } from 'react-router-dom';

interface CreateTaskModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
}

export function CreateTaskModal(props: CreateTaskModalProps): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const location = useLocation();
  const resourceType = location.pathname.split('/')[1];

  // Create a default resource with the correct resourceType
  const defaultResource = { resourceType } as Resource;

  // Function to create the resource and navigate to the resource page when the form is submitted
  const handleSubmit = (newResource: Resource): void => {
    medplum
      .createResource(newResource)
      .then((result) => navigate(`/${getReferenceString(result)}`))
      .catch((error) => console.error(error));
  };

  return (
    <Modal opened={props.opened} onClose={props.onClose}>
      <Text>New {resourceType}</Text>
      <ResourceForm defaultValue={defaultResource} onSubmit={handleSubmit}></ResourceForm>
    </Modal>
  );
}
