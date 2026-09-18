// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Menu, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { Patient, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import type { ReactNode } from 'react';
import { SmartHealthLinkImportModal } from '../smart/SmartHealthLinkImportModal';
import { SmartLogo } from '../smart/SmartLogo';

export interface PatientActionsMenu {
  readonly headerMenuItems: ReactNode;
  readonly actionsModals: ReactNode;
}

export function usePatientActionsMenu(patientArg: Patient | Reference<Patient> | undefined): PatientActionsMenu {
  const patient = useResource(patientArg);
  const [shlOpened, shlHandlers] = useDisclosure(false);

  const headerMenuItems = (
    <Menu.Item leftSection={<SmartLogo size={16} color="var(--mantine-color-dimmed)" />} onClick={shlHandlers.open}>
      <Text size="sm">Import Patient Records</Text>
    </Menu.Item>
  );

  const actionsModals = patient ? <SmartHealthLinkImportModal opened={shlOpened} onClose={shlHandlers.close} /> : null;

  return { headerMenuItems, actionsModals };
}
