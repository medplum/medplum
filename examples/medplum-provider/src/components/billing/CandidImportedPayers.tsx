// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Organization } from '@medplum/fhirtypes';
import { useMedplum, useStabilizedCallback } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import type { CandidPayerDirectory } from '../../hooks/useCandidPayerDirectory';
import { showErrorNotification } from '../../utils/notifications';
import { CandidImportedPayerList } from './CandidImportedPayerList';
import { CandidPayerDetailsModal } from './CandidPayerDetailsModal';

/**
 * Props for the enrolled payers tab. `resourceId` mirrors the URL: the ID of the imported payer whose details
 * modal is open. The tab never navigates itself but calls `onNavigate` with the ID the URL should move to, or
 * none to close the modal. `directory` is shared with the payer directory tab so imports show up here.
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
  const open = resourceId !== undefined && payer?.id === resourceId ? payer : undefined;

  useEffect(() => {
    if (!resourceId || open?.id === resourceId) {
      return undefined;
    }
    let active = true;
    medplum
      .readResource('Organization', resourceId)
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
  }, [medplum, navigate, resourceId, open]);

  return (
    <>
      <CandidImportedPayerList
        directory={directory}
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
    </>
  );
}
