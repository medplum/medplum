import { Anchor, Badge, Box, Button, Group, Modal, Radio, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { createReference } from '@medplum/core';
import { CodeableConcept, Encounter, MedicationRequest, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useState } from 'react';
import { CodeableConceptDisplay } from '../CodeableConceptDisplay/CodeableConceptDisplay';
import { CodeableConceptInput } from '../CodeableConceptInput/CodeableConceptInput';
import { Form } from '../Form/Form';
import { killEvent } from '../utils/dom';

export interface MedicationsProps {
  patient: Patient;
  encounter?: Encounter;
  medicationRequests: MedicationRequest[];
}

export function Medications(props: MedicationsProps): JSX.Element {
  const medplum = useMedplum();
  const [medicationRequests, setMedicationRequests] = useState<MedicationRequest[]>(props.medicationRequests);
  const [opened, { open, close }] = useDisclosure(false);
  const [code, setCode] = useState<CodeableConcept>();

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      const status = formData.status as 'active' | 'stopped';
      medplum
        .createResource<MedicationRequest>({
          resourceType: 'MedicationRequest',
          status,
          intent: 'order',
          encounter: props.encounter ? createReference(props.encounter) : undefined,
          medicationCodeableConcept: code,
          subject: createReference(props.patient),
        })
        .then((newRequest) => {
          setMedicationRequests([newRequest, ...medicationRequests]);
          close();
        })
        .catch(console.error);
    },
    [medplum, props.patient, props.encounter, medicationRequests, close, code]
  );

  return (
    <>
      <Group position="apart">
        <Text fz="md" fw={700}>
          Medications
        </Text>
        <Anchor
          href="#"
          onClick={(e) => {
            killEvent(e);
            open();
          }}
        >
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
