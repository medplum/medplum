import { Button, Flex, Modal, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { createReference, getCodeBySystem, normalizeErrorString } from '@medplum/core';
import { MedicationRequest, Patient, Resource } from '@medplum/fhirtypes';
import { Document, ResourceForm, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { NEUTRON_HEALTH_BOTS } from '../../bots/constants';
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

  async function handleCreatePrescription(prescription: Resource): Promise<void> {
    if (prescription.resourceType !== 'MedicationRequest') {
      throw new Error('Invalid resource type');
    }

    try {
      validateMedicationRequest(prescription);
    } catch (err) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
      throw new Error(normalizeErrorString(err));
    }

    try {
      const medicationRequest: MedicationRequest = await medplum.createResource({
        ...prescription,
      });

      await medplum.executeBot(
        { system: NEUTRON_HEALTH_BOTS, value: 'create-photon-prescription' },
        { ...medicationRequest }
      );
      console.log(medicationRequest);
      close();
      notifications.show({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Prescription created',
      });
    } catch (err) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
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

function validateMedicationRequest(prescription: MedicationRequest): void {
  const medicationCode = prescription.medicationCodeableConcept;
  const quantity = prescription.dispenseRequest?.quantity;
  const instructions = prescription.dosageInstruction?.[0].patientInstruction;

  if (!medicationCode) {
    throw new Error('MedicationRequest.medicationCodeableConcept: A Medication code is required');
  }

  if (!quantity || !quantity.value || !quantity.unit) {
    throw new Error(
      'MedicationRequest.dispenseRequest.quantity: A quantity with a value and unit must be provided for the prescription'
    );
  }

  if (!instructions) {
    throw new Error(
      'MedicationRequest.dosageInstruction.patientInstruction: Instructions must be provided for the patient'
    );
  }
}
