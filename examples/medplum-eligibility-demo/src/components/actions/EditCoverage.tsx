import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { normalizeErrorString } from '@medplum/core';
import { Coverage, Resource } from '@medplum/fhirtypes';
import { ResourceForm, useMedplum } from '@medplum/react';
import { showNotification } from '@mantine/notifications';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { cleanResource } from '../utils';

interface EditCoverageProps {
  readonly coverage: Coverage;
  readonly onChange: (updatedCoverage: Coverage) => void;
}

export function EditCoverage({ coverage, onChange }: EditCoverageProps): JSX.Element {
  const medplum = useMedplum();
  const [opened, { toggle, close }] = useDisclosure(false);

  const handleSubmit = async (newCoverage: Resource): Promise<void> => {
    try {
      // Update the coverage with the new details. We clean the resource in order to overwrite the necessary metadata
      const updatedCoverage = (await medplum.updateResource(cleanResource(newCoverage))) as Coverage;
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Coverage updated',
      });
      toggle();
      onChange(updatedCoverage);
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
      <Button fullWidth onClick={toggle}>
        Edit Coverage
      </Button>
      <Modal opened={opened} onClose={close} size="lg">
        <ResourceForm defaultValue={coverage} onSubmit={handleSubmit} />
      </Modal>
    </div>
  );
}
