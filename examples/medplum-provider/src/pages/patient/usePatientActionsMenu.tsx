// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Menu, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { Patient, Reference } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import { IconEdit } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { PatientEditModal } from './PatientEditModal';

export interface PatientActionsMenu {
  /** `<Menu.Item>` nodes to pass to `PatientSummary`'s `headerMenuItems` prop. */
  readonly headerMenuItems: ReactNode;
  /** The action modals to render alongside the summary. */
  readonly actionsModals: ReactNode;
  /** Opens the patient edit modal — pass to `PatientSummary`'s `onEditPatient` prop. */
  readonly openEditModal: () => void;
}

/**
 * Shared "…" header-menu actions for the Patient Summary. The actions open state-driven
 * modals hosted here, so the menu works wherever the summary appears (patient chart,
 * /Communication, /Task, …).
 * @param patientArg - The patient (or a reference to it) the actions apply to; undefined while loading.
 * @returns The menu items and the modals to render.
 */
export function usePatientActionsMenu(patientArg: Patient | Reference<Patient> | undefined): PatientActionsMenu {
  const patient = useResource(patientArg);
  const [editOpened, editHandlers] = useDisclosure(false);

  const headerMenuItems = (
    <Menu.Item leftSection={<IconEdit size={16} color="var(--mantine-color-dimmed)" />} onClick={editHandlers.open}>
      <Text size="sm">Edit Patient Profile Details</Text>
    </Menu.Item>
  );

  const actionsModals = patient ? (
    <PatientEditModal patient={patient} opened={editOpened} onClose={editHandlers.close} />
  ) : null;

  return { headerMenuItems, actionsModals, openEditModal: editHandlers.open };
}
