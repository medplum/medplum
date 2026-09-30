// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Organization } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useState } from 'react';
import type { CandidPayerDirectory } from '../../hooks/useCandidPayerDirectory';
import { CandidPayerDetailsModal } from './CandidPayerDetailsModal';
import { CandidPayerDirectorySearch } from './CandidPayerDirectorySearch';

/**
 * Props for the payer directory tab. Search results are not persisted, so the details modal for a tapped result
 * lives in tab state rather than the URL. `directory` is shared with the enrolled payers tab so imports show up
 * there.
 */
export interface PayerDirectoryTabProps {
  readonly directory: CandidPayerDirectory;
}

export function CandidDirectoryPayers(props: PayerDirectoryTabProps): JSX.Element {
  const { directory } = props;
  const [payer, setPayer] = useState<Organization | undefined>(undefined);

  return (
    <>
      <CandidPayerDirectorySearch directory={directory} onSelectPayer={setPayer} />
      <CandidPayerDetailsModal
        directory={directory}
        payer={payer}
        onClose={() => setPayer(undefined)}
        onPayerUpdated={setPayer}
      />
    </>
  );
}
