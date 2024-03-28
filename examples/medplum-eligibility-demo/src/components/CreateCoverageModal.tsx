import { Modal, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getReferenceString } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { ResourceForm, useMedplum } from '@medplum/react';
import { IconCircleCheck } from '@tabler/icons-react';
import { useLocation, useNavigate } from 'react-router-dom';

interface CreateCoverageModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
}

export function CreateCoverageModal({ opened, onClose }: CreateCoverageModalProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const resourceType = location.pathname.split('/')[1];

  // Create a blank resource so you can add any details you would like.
  const defaultResource = { resourceType } as Resource;

  const handleSubmit = (newResource: Resource): void => {
    // Create the Coverage and navigate to its details page
    medplum
      .createResource(newResource)
      .then((result) => navigate(`/${getReferenceString(result)}`))
      .then(() =>
        showNotification({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Coverage created',
        })
      )
      .catch((error) => console.error(error));
  };

  return (
    <Modal opened={opened} onClose={onClose}>
      <Text>New {resourceType}</Text>
      <ResourceForm defaultValue={defaultResource} onSubmit={handleSubmit} />
    </Modal>
  );
}
