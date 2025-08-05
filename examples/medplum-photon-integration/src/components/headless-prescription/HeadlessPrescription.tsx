// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Flex, Modal, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { createReference } from '@medplum/core';
import { MedicationRequest, Patient, Resource } from '@medplum/fhirtypes';
import { Document, ResourceForm, useMedplum } from '@medplum/react';
import { JSX, useEffect, useState } from 'react';
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
  }, [medplum, prescriptions, props.patient.id]);

  const medicationRequest: MedicationRequest = {
    resourceType: 'MedicationRequest',
    status: 'draft',
    intent: 'original-order',
    subject: createReference(props.patient),
  };

  function handlePrescriptionChange(prescription: MedicationRequest): void {
    console.log(prescription);
  }

  function handleCreatePrescription(prescription: Resource): void {
    if (prescription.resourceType !== 'MedicationRequest') {
      throw new Error('Invalid resource type');
    }
    console.log(prescription);
    close();
  }

  return (
    <Document>
      <Flex justify="space-between" mb="md">
        <Title>Headless Prescription Management</Title>
        <Button onClick={open}>Create New Prescription</Button>
      </Flex>
      <PrescriptionTable prescriptions={prescriptions} onChange={handlePrescriptionChange} />
      <Modal opened={opened} onClose={close}>
        <ResourceForm defaultValue={medicationRequest} onSubmit={handleCreatePrescription} />
      </Modal>
    </Document>
  );
}
