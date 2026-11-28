// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Claim } from '@medplum/fhirtypes';
import { Modal, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { discardClaim } from './discardClaim';

export interface DiscardClaimModalProps {
  /** The claim to discard; the modal is open while there is one. */
  readonly claim?: WithId<Claim>;
  readonly onClose: () => void;
  /** Called once the claim is discarded. */
  readonly onDiscarded: () => void;
}

/**
 * Confirms discarding a claim that was never submitted, then discards it.
 * @param props - The DiscardClaimModal React props.
 * @returns The modal.
 */
export function DiscardClaimModal(props: DiscardClaimModalProps): JSX.Element {
  const { claim, onClose, onDiscarded } = props;
  const medplum = useMedplum();
  const [busy, setBusy] = useState(false);

  const discard = async (): Promise<void> => {
    if (!claim) {
      return;
    }
    setBusy(true);
    try {
      await discardClaim(medplum, claim);
      showNotification({
        color: 'green',
        title: 'Claim discarded',
        message: 'Its charge items are still on the visit, now not on a claim.',
      });
      onClose();
      onDiscarded();
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      opened={!!claim}
      onClose={onClose}
      title="Discard Claim"
      actions={
        <Button color="red" loading={busy} onClick={discard}>
          Discard Claim
        </Button>
      }
    >
      <Text size="sm">
        This claim was never submitted. Its charge items are still on the visit, and show as not on a claim until you
        add them to another. This claim is kept on record, marked as entered in error.
      </Text>
    </Modal>
  );
}
