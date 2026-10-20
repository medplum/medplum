// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button } from '@mantine/core';
import type { Organization } from '@medplum/fhirtypes';
import { Modal } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { CandidPayerDirectory } from '../../hooks/useCandidPayerDirectory';
import { CandidPayerDetailsModal } from './CandidPayerDetailsModal';
import { CandidPayerDirectorySearch } from './CandidPayerDirectorySearch';

/**
 * Props for the import payers modal of the enrolled payers tab. Search results are not persisted, so the details
 * modal for a tapped result lives in component state rather than the URL. `directory` is shared with the enrolled
 * payers list so imports show up there.
 */
export interface CandidDirectoryPayersProps {
  readonly directory: CandidPayerDirectory;
  readonly opened: boolean;
  readonly onClose: () => void;
}

export function CandidDirectoryPayers(props: CandidDirectoryPayersProps): JSX.Element {
  const { directory, opened, onClose } = props;
  const [payer, setPayer] = useState<Organization | undefined>(undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleImport = async (): Promise<void> => {
    await directory.importPayers(selected);
    setSelected(new Set());
  };

  return (
    <>
      <Modal
        opened={opened}
        onClose={() => {
          setSelected(new Set());
          onClose();
        }}
        title="Import Payers from Directory"
        size="xl"
        bodyHeight="70vh"
        actions={
          !!directory.searchResults?.length && (
            <Button
              onClick={() => handleImport().catch(console.error)}
              disabled={selected.size === 0}
              loading={directory.importing}
            >
              Import selected ({selected.size})
            </Button>
          )
        }
      >
        <CandidPayerDirectorySearch
          directory={directory}
          selected={selected}
          onSelectedChange={setSelected}
          onSelectPayer={setPayer}
        />
      </Modal>
      <CandidPayerDetailsModal
        directory={directory}
        payer={payer}
        onClose={() => setPayer(undefined)}
        onPayerUpdated={setPayer}
      />
    </>
  );
}
