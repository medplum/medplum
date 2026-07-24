// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Flex, Select, Stack, Textarea } from '@mantine/core';
import { isResourceWithId } from '@medplum/core';
import type { Slot } from '@medplum/fhirtypes';
import { DateTimeInput, Form } from '@medplum/react';
import { IconCirclePlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';

interface SlotFormProps {
  slot: Slot;
  isLoading: boolean;
  onSubmit: (slot: Slot) => void;
}

export function SlotForm(props: SlotFormProps): JSX.Element {
  const { isLoading } = props;
  const { slot } = props;
  const [status, setStatus] = useState<Slot['status']>(slot.status);
  const [comment, setComment] = useState(slot.comment);
  const [start, setStart] = useState(slot.start);
  const [end, setEnd] = useState(slot.end);

  const handleSubmit = (): void => {
    props.onSubmit({
      ...slot,
      status,
      start,
      end,
      comment,
    });
  };

  return (
    <Form onSubmit={handleSubmit}>
      <Flex direction="column" gap="md" h="100%" justify="space-between">
        <Stack gap="md" h="100%">
          <DateTimeInput name="start" label="Start" defaultValue={start} required onChange={setStart} />

          <DateTimeInput name="end" label="End" defaultValue={end} required onChange={setEnd} />

          <Select
            label="Status"
            value={status}
            onChange={(value) => setStatus(value as Slot['status'])}
            data={[
              { value: 'busy', label: 'Busy' },
              { value: 'free', label: 'Free' },
            ]}
          />

          <Textarea label="Comment" value={comment} onChange={(event) => setComment(event.currentTarget.value)} />
        </Stack>

        <Button fullWidth type="submit" loading={isLoading} leftSection={<IconCirclePlus />}>
          {isResourceWithId(slot) ? 'Update Slot' : 'Create Slot'}
        </Button>
      </Flex>
    </Form>
  );
}
