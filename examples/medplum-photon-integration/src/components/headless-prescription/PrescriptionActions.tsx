// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Menu } from '@mantine/core';
import { MedicationRequest } from '@medplum/fhirtypes';
import { IconCircleOff, IconEdit, IconMenu2, IconNewSection, IconRefresh } from '@tabler/icons-react';
import { JSX } from 'react';

interface PrescriptionActionButtonProps {
  prescription: MedicationRequest;
  onChange: (prescription: MedicationRequest) => void;
}

export function PrescriptionActionButton(props: PrescriptionActionButtonProps): JSX.Element {
  function handleRenewPrescription(): void {
    console.log(props.prescription);
  }

  function handleEditPrescription(): void {
    console.log(props.prescription);
  }

  function handleCancelPrescription(): void {
    console.log(props.prescription);
  }

  return (
    <Menu trigger="hover" openDelay={200}>
      <Menu.Target>
        <Button variant="transparent">
          <IconMenu2 />
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Actions</Menu.Label>
        {props.prescription.status === 'draft' ? (
          <Menu.Item onClick={() => console.log('Creating an order...')} leftSection={<IconNewSection size={16} />}>
            Create Order
          </Menu.Item>
        ) : null}
        <Menu.Item onClick={handleRenewPrescription} leftSection={<IconRefresh size={16} />}>
          Renew Prescription
        </Menu.Item>
        <Menu.Item onClick={handleEditPrescription} leftSection={<IconEdit size={16} />}>
          Edit Prescription
        </Menu.Item>
        <Menu.Item onClick={handleCancelPrescription} leftSection={<IconCircleOff size={16} />}>
          Cancel Prescription
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
