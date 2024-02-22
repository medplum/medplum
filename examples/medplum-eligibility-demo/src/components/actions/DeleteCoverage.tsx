import { Alert, Button, Group, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { MedplumClient, normalizeErrorString } from '@medplum/core';
import { Coverage } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconAlertCircle, IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { NavigateFunction, useNavigate } from 'react-router-dom';

interface DeleteCoverageProps {
  readonly coverage: Coverage;
}

export function DeleteCoverage({ coverage }: DeleteCoverageProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [opened, { close, toggle }] = useDisclosure(false);

  const handleDelete = async (
    coverage: Coverage,
    medplum: MedplumClient,
    navigate: NavigateFunction
  ): Promise<void> => {
    const coverageId = coverage.id as string;

    try {
      // Delete the task and navigate back to the Coverage search page
      await medplum.deleteResource('Coverage', coverageId);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Coverage deleted',
      });
      navigate('/Coverage');
    } catch (err) {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  };

  return (
    <div>
      <Button fullWidth onClick={toggle} color="red">
        Delete Coverage
      </Button>
      <Modal withCloseButton={false} opened={opened} onClose={close}>
        <Alert color="red" title="Warning" icon={<IconAlertCircle />}>
          <b>Are you sure you want to delete this coverage?</b>
          <Group mt="sm">
            <Button onClick={() => handleDelete(coverage, medplum, navigate)} color="red">
              Yes, Delete
            </Button>
            <Button onClick={close} color="red" variant="outline">
              Cancel
            </Button>
          </Group>
        </Alert>
      </Modal>
    </div>
  );
}
