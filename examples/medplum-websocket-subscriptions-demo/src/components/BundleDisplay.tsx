import { Accordion, ActionIcon, Chip, Group } from '@mantine/core';
import { Bundle, Communication, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconArrowNarrowRight, IconCheck } from '@tabler/icons-react';
import { SyntheticEvent, useCallback } from 'react';

export interface BundleDisplayProps {
  readonly bundle: Bundle;
}

export function BundleDisplay(props: BundleDisplayProps): JSX.Element {
  const medplum = useMedplum();
  const { bundle } = props;
  const communication = bundle?.entry?.[1].resource as Communication;
  const [senderType, senderId] = ((communication.sender as Reference).reference as string).split('/');
  const [recipientType, recipientId] = ((communication.recipient?.[0] as Reference).reference as string).split('/');

  const markAsCompleted = useCallback(
    (e: SyntheticEvent) => {
      e.stopPropagation();
      e.preventDefault();
      medplum
        .updateResource<Communication>({
          ...communication,
          received: new Date().toISOString(), // Mark as received
          status: 'completed', // Mark as read
          // See: https://www.medplum.com/docs/communications/organizing-communications#:~:text=THE%20Communication%20LIFECYCLE
          // for more info about recommended `Communication` lifecycle
        })
        .catch(console.error);
    },
    [medplum, communication]
  );

  return (
    <Accordion.Item value={`${bundle?.timestamp ?? 'Unknown time'}: Chat Notification`}>
      <Accordion.Control>
        <Group>
          {bundle.timestamp}{' '}
          <Chip checked={false}>
            {senderType}/{senderId.slice(0, 8)}
          </Chip>
          <IconArrowNarrowRight />
          <Chip checked={false}>
            {recipientType}/{recipientId.slice(0, 8)}
          </Chip>
          <Chip checked={communication.status === 'completed'} color="blue" variant="filled">
            {communication.status}
          </Chip>
          {communication.status !== 'completed' && (
            <ActionIcon variant="subtle" aria-label="Complete" onClick={markAsCompleted}>
              <IconCheck style={{ width: '70%', height: '70%' }} stroke={1.5} />
            </ActionIcon>
          )}
        </Group>
      </Accordion.Control>
      <Accordion.Panel>
        <div
          style={{
            paddingLeft: 30,
            paddingRight: 30,
            paddingTop: 20,
            paddingBottom: 20,
            borderRadius: 10,
            textAlign: 'left',
          }}
        >
          <pre>{JSON.stringify(bundle, null, 2)}</pre>
        </div>
      </Accordion.Panel>
    </Accordion.Item>
  );
}
