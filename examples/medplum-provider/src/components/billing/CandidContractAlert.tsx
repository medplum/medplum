// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Group, Loader, Text } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import type { JSX } from 'react';
import type { CandidProviderContracts } from '../../hooks/useCandidProviderContracts';
import { getContractPayerNames } from '../../utils/candid';

/** Payer names listed before the rest collapse into a count. */
const MAX_PAYER_NAMES = 5;

export interface CandidContractAlertProps {
  readonly contracts: CandidProviderContracts;
  /** Whose contracts these are, as read in the sentence: "this organization", "Test Medical Practice LLC". */
  readonly subject: string;
}

/**
 * Whether the contracting provider has a payer contract in force in Candid, looked up live when the form opens.
 * Informational only: contracts are set up in the Candid portal, so saving is never held on this.
 * @param props - The contract state and whose contracts they are.
 * @returns The alert, or null when there is nothing to report.
 */
export function CandidContractAlert(props: CandidContractAlertProps): JSX.Element | null {
  const { contracts, subject } = props;

  switch (contracts.status) {
    case 'unavailable':
      return null;
    case 'loading':
      return (
        <Group gap="xs">
          <Loader size="xs" />
          <Text size="sm" c="dimmed">
            Checking Candid contracts...
          </Text>
        </Group>
      );
    case 'contracted':
      return (
        <Alert icon={<IconCircleCheck size={16} />} color="green" variant="light">
          Active Candid contracts for {subject}: {formatPayerNames(getContractPayerNames(contracts.contracts))}
        </Alert>
      );
    case 'uncontracted':
      return (
        <Alert icon={<IconAlertTriangle size={16} />} color="yellow" variant="light">
          No active Candid contract for {subject}. Candid rejects insurance claims until a payer contract is set up in
          the Candid portal.
        </Alert>
      );
    case 'failed':
      return (
        <Alert icon={<IconAlertTriangle size={16} />} color="yellow" variant="light">
          Could not check Candid contracts: {contracts.message}.
        </Alert>
      );
    default:
      return null;
  }
}

function formatPayerNames(names: string[]): string {
  if (names.length === 0) {
    return 'payer not named';
  }
  const shown = names.slice(0, MAX_PAYER_NAMES).join(', ');
  const rest = names.length - MAX_PAYER_NAMES;
  return rest > 0 ? `${shown} +${rest} more` : shown;
}
