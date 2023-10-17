import { Anchor, Badge, Box, Button, Group, Modal, Stack, Text, Radio } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { getDisplayString } from '@medplum/core';
import { CodeableConcept, MedicationRequest, Patient } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, CodeableConceptInput, Form, useMedplum } from '@medplum/react';
import React, { useCallback, useState } from 'react';

export interface MedicationRequestsProps {
  patient: Patient;
  medicationRequests: MedicationRequest[];
}

export function MedicationRequests(props: MedicationRequestsProps): JSX.Element {
  const medplum = useMedplum();
  const [medicationRequests, setMedicationRequests] = useState<MedicationRequest[]>(props.medicationRequests);
  const [opened, { open, close }] = useDisclosure(false);
  const [code, setCode] = useState<CodeableConcept>();

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      console.log('handleSubmit', formData);
      const status = formData.status as 'active' | 'stopped'
      medplum
        .createResource<MedicationRequest>({
          resourceType: 'MedicationRequest',
          status,
          intent: 'order',
          medicationCodeableConcept: code,
          subject: {
            reference: `Patient/${props.patient.id}`,
            display: getDisplayString(props.patient),
          },
        })
        .then((newRequest) => {
          setMedicationRequests([newRequest, ...medicationRequests]);
          close();
        })
        .catch(console.error);
    },
    [medplum, props.patient, medicationRequests, close, code]
  );

  return (
    <>
      <Group position="apart">
        <Text fz="md" fw={700}>
          Medication Requests
        </Text>
        <Anchor href="#" onClick={open}>
          + Add
        </Anchor>
      </Group>
      {medicationRequests.length > 0 ? (
        <Box>
          {medicationRequests.map((request) => (
            <Badge mt={4} key={request.id} maw="50%" color={request.status === 'active' ? 'blue' : 'gray'}>
              <CodeableConceptDisplay value={request.medicationCodeableConcept} />
            </Badge>
          ))}
        </Box>
      ) : (
        <Text>(none)</Text>
      )}
      <Modal opened={opened} onClose={close} title="Add Medication Request">
        <Form onSubmit={handleSubmit}>
          <Stack h={275}>
            <CodeableConceptInput
              name="request"
              data-autofocus={true}
              binding="https://app.medplum.com/ValueSet/16d6f7b7-7eeb-4d0e-a83b-83be082aa10b"
              onChange={(request) => setCode(request)}
            />
            <Radio.Group mt={32} name="status" label="Request Status" required>
              <Radio key={'active'} value={'active'} label={'active'} my="xs" />
              <Radio key={'stopped'} value={'stopped'} label={'stopped'} my="xs" />
            </Radio.Group>
            <Group position="right" spacing={4} mt="md">
              <Button type="submit">Save</Button>
            </Group>
          </Stack>
        </Form>
      </Modal>
    </>
  );
}
