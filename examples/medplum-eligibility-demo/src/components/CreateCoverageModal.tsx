import { Modal, Text } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { ResourceForm, useMedplum } from '@medplum/react';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

interface CreateCoverageModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
}

export function CreateCoverageModal({ opened, onClose }: CreateCoverageModalProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const resourceType = location.pathname.split('/')[1];

  const defaultResource = { resourceType } as Resource;

  const handleSubmit = (newResource: Resource) => {
    medplum
      .createResource(newResource)
      .then((result) => navigate(`/${getReferenceString(result)}`))
      .catch((error) => console.error(error));
  };

  return (
    <Modal opened={opened} onClose={onClose}>
      <Text>New {resourceType}</Text>
      <ResourceForm defaultValue={defaultResource} onSubmit={handleSubmit} />
    </Modal>
  );
}
