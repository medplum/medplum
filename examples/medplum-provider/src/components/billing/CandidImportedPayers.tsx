// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Organization } from '@medplum/fhirtypes';
import { useMedplum, useStabilizedCallback } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import type { CandidPayerDirectory } from '../../hooks/useCandidPayerDirectory';
import { showErrorNotification } from '../../utils/notifications';
import { CandidDirectoryPayers } from './CandidDirectoryPayers';
import { CandidImportedPayerList } from './CandidImportedPayerList';
import { CandidPayerDetailsModal } from './CandidPayerDetailsModal';

/** The `resourceId` that opens the payer directory modal, to import payers from. */
const PAYER_DIRECTORY_ID = 'new';

/**
 * Props for the enrolled payers tab. `resourceId` mirrors the URL: the ID of the imported payer whose details
 * modal is open, or `PAYER_DIRECTORY_ID` for the payer directory modal. The tab never navigates itself but calls
 * `onNavigate` with the ID the URL should move to, or none to close the modal.
 */
export interface ImportedPayersTabProps {
  readonly directory: CandidPayerDirectory;
  readonly resourceId?: string;
  readonly onNavigate: (resourceId?: string) => void;
}

export function CandidImportedPayers(props: ImportedPayersTabProps): JSX.Element {
  const { directory, resourceId, onNavigate } = props;
  const medplum = useMedplum();
  const navigate = useStabilizedCallback(onNavigate);
  const [payer, setPayer] = useState<Organization | undefined>(undefined);
  const directoryOpen = resourceId === PAYER_DIRECTORY_ID;
  const linkedId = directoryOpen ? undefined : resourceId;
  const open = linkedId !== undefined && payer?.id === linkedId ? payer : undefined;

  useEffect(() => {
    if (!linkedId || open?.id === linkedId) {
      return undefined;
    }
    let active = true;
    medplum
      .readResource('Organization', linkedId)
      .then((organization) => {
        if (active) {
          setPayer(organization);
        }
      })
      .catch((err) => {
        if (active) {
          showErrorNotification(err);
          navigate();
        }
      });
    return () => {
      active = false;
    };
  }, [medplum, navigate, linkedId, open]);

  return (
    <>
      <CandidImportedPayerList
        directory={directory}
        onAddPayers={() => onNavigate(PAYER_DIRECTORY_ID)}
        onSelectPayer={(selected) => {
          setPayer(selected);
          onNavigate(selected.id);
        }}
      />
      <CandidPayerDetailsModal
        directory={directory}
        payer={open}
        onClose={() => {
          setPayer(undefined);
          onNavigate();
        }}
        onPayerUpdated={setPayer}
      />
      <CandidDirectoryPayers directory={directory} opened={directoryOpen} onClose={() => onNavigate()} />
    </>
  );
}
