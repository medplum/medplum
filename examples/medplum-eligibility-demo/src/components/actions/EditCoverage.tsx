import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { normalizeErrorString } from '@medplum/core';
import { Coverage, Resource } from '@medplum/fhirtypes';
import { ResourceForm, useMedplum } from '@medplum/react';
import { notifications } from '@mantine/notifications';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';

interface EditCoverageProps {
  readonly coverage: Coverage;
  readonly onChange: (updatedCoverage: Coverage) => void;
}

export function EditCoverage({ coverage, onChange }: EditCoverageProps): JSX.Element {
  const medplum = useMedplum();
  const [opened, { toggle, close }] = useDisclosure(false);

  const handleSubmit = async (newCoverage: Resource) => {
    try {
      // Update the coverage with the new details
      const updatedCoverage = (await medplum.updateResource(cleanResource(newCoverage))) as Coverage;
      notifications.show({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Coverage updated',
      });
      toggle();
      onChange(updatedCoverage);
    } catch (err) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  };

  // Clean the resource so that the meta details can be correctly updated
  function cleanResource(resource: Resource): Resource {
    let meta = resource.meta;
    if (meta) {
      meta = {
        ...meta,
        lastUpdated: undefined,
        versionId: undefined,
        author: undefined,
      };
    }
    return {
      ...resource,
      meta,
    };
  }

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
