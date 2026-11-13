// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Menu, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { Patient, Reference } from '@medplum/fhirtypes';
import { SmartLogo } from '@medplum/react';
import { IconDownload, IconEdit } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { SmartHealthLinkImportModal } from '../smart/SmartHealthLinkImportModal';
import { PatientEditModal } from './PatientEditModal';
import { PatientExportModal } from './PatientExportModal';

export interface PatientActionsMenu {
  readonly headerMenuItems: ReactNode;
  readonly actionsModals: ReactNode;
  readonly openEditModal: () => void;
  readonly openExportModal: () => void;
}

export function usePatientActionsMenu(patient: Patient | Reference<Patient> | undefined): PatientActionsMenu {
  const [editOpened, editHandlers] = useDisclosure(false);
  const [exportOpened, exportHandlers] = useDisclosure(false);
  const [importOpened, importHandlers] = useDisclosure(false);

  const headerMenuItems = (
    <>
      <Menu.Item leftSection={<IconEdit size={16} color="var(--mantine-color-dimmed)" />} onClick={editHandlers.open}>
        <Text size="sm">Edit Patient Profile Details</Text>
      </Menu.Item>
      <Menu.Item
        leftSection={<SmartLogo size={16} color="var(--mantine-color-dimmed)" />}
        onClick={importHandlers.open}
      >
        <Text size="sm">Import Patient Records</Text>
      </Menu.Item>
      <Menu.Item
        leftSection={<IconDownload size={16} color="var(--mantine-color-dimmed)" />}
        onClick={exportHandlers.open}
      >
        <Text size="sm">Export Patient Records</Text>
      </Menu.Item>
    </>
  );

  const actionsModals = patient ? (
    <>
      <PatientEditModal patient={patient} opened={editOpened} onClose={editHandlers.close} />
      <PatientExportModal patient={patient} opened={exportOpened} onClose={exportHandlers.close} />
      <SmartHealthLinkImportModal opened={importOpened} onClose={importHandlers.close} />
    </>
  ) : null;

  return {
    headerMenuItems,
    actionsModals,
    openEditModal: editHandlers.open,
    openExportModal: exportHandlers.open,
  };
}
