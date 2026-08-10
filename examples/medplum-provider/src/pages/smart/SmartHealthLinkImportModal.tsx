// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Modal } from '@medplum/react';
import type { JSX } from 'react';
import { SmartHealthLinkImport } from './SmartHealthLinkImport';

export interface SmartHealthLinkImportModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
}

export function SmartHealthLinkImportModal({ opened, onClose }: SmartHealthLinkImportModalProps): JSX.Element {
  return (
    <Modal opened={opened} onClose={onClose} size="lg" title="Import from SMART Health Card or Link">
      <SmartHealthLinkImport onImported={onClose} />
    </Modal>
  );
}
