// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import type { ConfirmModalProps } from './ConfirmModal';
import { ConfirmModal } from './ConfirmModal';

export type DiscardChangesModalProps = Pick<ConfirmModalProps, 'opened' | 'onCancel' | 'onConfirm' | 'children'>;

/**
 * Asks before unsaved changes are thrown away.
 * @param props - Whether it is open, what goes unsaved, and what each answer does.
 * @returns The dialog.
 */
export function DiscardChangesModal(props: DiscardChangesModalProps): JSX.Element {
  return (
    <ConfirmModal
      {...props}
      title="Discard unsaved changes?"
      cancelLabel="Keep editing"
      confirmLabel="Discard changes"
      destructive
    />
  );
}
