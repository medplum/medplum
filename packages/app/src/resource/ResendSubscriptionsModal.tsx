import { Button, Checkbox, Group, Modal, Stack } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { Form, ResourceInput, useMedplum } from '@medplum/react';
import { useCallback, useState } from 'react';

export interface ResendSubscriptionsModalProps {
  readonly resource: Resource | undefined;
  readonly opened: boolean;
  readonly onClose: () => void;
}

export function ResendSubscriptionsModal(props: ResendSubscriptionsModalProps): JSX.Element {
  const medplum = useMedplum();
  const { resource, opened, onClose } = props;
  const [choose, setChoose] = useState(false);
  const [subscription, setSubscription] = useState<Resource | undefined>();
  const [verbose, setVerbose] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!resource?.id) {
      return;
    }
    try {
      await medplum.post(medplum.fhirUrl(resource.resourceType, resource.id, '$resend'), {
        subscription: choose && subscription ? getReferenceString(subscription) : undefined,
        verbose,
      });
      showNotification({ color: 'green', message: 'Done' });
      onClose();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }, [medplum, resource, onClose, choose, subscription, verbose]);

  return (
    <Modal opened={opened} onClose={onClose} title="Resend Subscriptions">
      <Form onSubmit={handleSubmit}>
        <Stack>
          <Checkbox
            label="Choose subscription (all subscriptions by default)"
            onChange={(e) => setChoose(e.currentTarget.checked)}
          />
          {choose && (
            <ResourceInput
              name="subscription"
              resourceType="Subscription"
              placeholder="Subscription"
              onChange={setSubscription}
            />
          )}
          <Checkbox label="Verbose mode" onChange={(e) => setVerbose(e.currentTarget.checked)} />
          <Group justify="flex-end">
            <Button type="submit">Resend</Button>
          </Group>
        </Stack>
      </Form>
    </Modal>
  );
}
