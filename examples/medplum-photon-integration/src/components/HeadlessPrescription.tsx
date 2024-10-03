import { Button, Flex, Modal, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { MedicationRequest, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { PrescriptionTable } from './PrescriptionTable';

interface HeadlessPrescriptionProps {
  patient: Patient;
}

export function HeadlessPrescription(props: HeadlessPrescriptionProps): JSX.Element {
  const medplum = useMedplum();
  const [prescriptions, setPrescriptions] = useState<MedicationRequest[]>([]);
  const [opened, { open, close }] = useDisclosure();

  useEffect(() => {
    medplum
      .searchResources('MedicationRequest', {
        patient: `Patient/${props.patient.id}`,
      })
      .then(setPrescriptions)
      .catch(console.error);
  }, [medplum, prescriptions]);

  return (
    <Document>
      <Flex justify="space-between" mb="md">
        <Title>Headless Prescription Management</Title>
        <Button onClick={open}>Create New Prescription</Button>
      </Flex>
      <PrescriptionTable prescriptions={prescriptions} />
      <Modal opened={opened} onClose={close} />
    </Document>
  );
}
