// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Menu, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { Patient, Reference } from '@medplum/fhirtypes';
import { IconEdit } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { SmartHealthLinkImportModal } from '../smart/SmartHealthLinkImportModal';
import { SmartLogo } from '../smart/SmartLogo';
import { PatientEditModal } from './PatientEditModal';

export interface PatientActionsMenu {
  readonly headerMenuItems: ReactNode;
  readonly actionsModals: ReactNode;
  readonly openEditModal: () => void;
}

export function usePatientActionsMenu(patient: Patient | Reference<Patient> | undefined): PatientActionsMenu {
  const [editOpened, editHandlers] = useDisclosure(false);
  const [shlOpened, shlHandlers] = useDisclosure(false);

  const headerMenuItems = (
    <>
      <Menu.Item leftSection={<IconEdit size={16} color="var(--mantine-color-dimmed)" />} onClick={editHandlers.open}>
        <Text size="sm">Edit Patient Profile Details</Text>
      </Menu.Item>
      <Menu.Item leftSection={<SmartLogo size={16} color="var(--mantine-color-dimmed)" />} onClick={shlHandlers.open}>
        <Text size="sm">Import Patient Records</Text>
      </Menu.Item>
    </>
  );

  const actionsModals = patient ? (
    <>
      <PatientEditModal patient={patient} opened={editOpened} onClose={editHandlers.close} />
      <SmartHealthLinkImportModal opened={shlOpened} onClose={shlHandlers.close} />
    </>
  ) : null;

  return { headerMenuItems, actionsModals, openEditModal: editHandlers.open };
}
