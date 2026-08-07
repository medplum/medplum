// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Modal } from '@mantine/core';
import type { JSX } from 'react';
import { SmartHealthLinkImport } from './SmartHealthLinkImport';

export interface SmartHealthLinkImportModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
}

export function SmartHealthLinkImportModal({ opened, onClose }: SmartHealthLinkImportModalProps): JSX.Element {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title="Import from SMART Health Card or Link"
      styles={{
        body: {
          paddingTop: 'var(--mantine-spacing-xl)',
        },
      }}
    >
      <SmartHealthLinkImport variant="modal" onImported={onClose} />
    </Modal>
  );
}
