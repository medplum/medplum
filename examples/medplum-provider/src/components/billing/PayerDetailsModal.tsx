// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, Group, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { getIdentifier } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { Modal } from '@medplum/react';
import { IconRefresh } from '@tabler/icons-react';
import type { JSX } from 'react';
import type { CandidPayerDirectory } from '../../hooks/useCandidPayerDirectory';
import { formatPayerCategory, getPayerCategory } from '../../utils/billing';
import {
  CANDID_ELIGIBILITY_SUPPORT_EXTENSION,
  CANDID_PROFESSIONAL_CLAIMS_SUPPORT_EXTENSION,
  CANDID_REMITTANCE_SUPPORT_EXTENSION,
  CHC_PAYER_ID_SYSTEM,
  CMS_PAYER_ID_SYSTEM,
} from '../../utils/candid';

const SUPPORT_STATE_LABELS: Record<string, { label: string; color: string }> = {
  SUPPORTED_ENROLLMENT_NOT_REQUIRED: { label: 'Supported', color: 'green' },
  SUPPORTED_ENROLLMENT_REQUIRED: { label: 'Enrollment required', color: 'yellow' },
  NOT_SUPPORTED: { label: 'Not supported', color: 'gray' },
};

const PAYER_SUPPORT_CAPABILITIES: { url: string; label: string }[] = [
  { url: CANDID_ELIGIBILITY_SUPPORT_EXTENSION, label: 'Eligibility' },
  { url: CANDID_PROFESSIONAL_CLAIMS_SUPPORT_EXTENSION, label: 'Professional claims' },
  { url: CANDID_REMITTANCE_SUPPORT_EXTENSION, label: 'Remittance' },
];

export interface PayerDetailsModalProps {
  readonly directory: CandidPayerDirectory;
  /** A search result (not yet persisted, no id) or an imported payer (with id, refreshable). */
  readonly payer: Organization | undefined;
  readonly onClose: () => void;
  /** Called with the patched payer when a refresh changes it. */
  readonly onPayerUpdated: (payer: Organization) => void;
}

export function PayerDetailsModal(props: PayerDetailsModalProps): JSX.Element {
  const { directory, payer, onClose, onPayerUpdated } = props;

  const handleRefresh = async (): Promise<void> => {
    const updated = await directory.refreshPayer(payer as WithId<Organization>);
    if (updated) {
      onPayerUpdated(updated);
    }
  };

  return (
    <Modal
      opened={payer !== undefined}
      onClose={onClose}
      title={payer?.name}
      size="lg"
      actions={
        // Only an imported (persisted) payer can be refreshed
        payer?.id !== undefined &&
        !!directory.botId && (
          <Group justify="flex-start" style={{ width: '100%' }}>
            <Button
              variant="outline"
              leftSection={<IconRefresh size={16} />}
              onClick={() => handleRefresh().catch(console.error)}
              loading={directory.refreshing}
            >
              Refresh from directory
            </Button>
          </Group>
        )
      }
    >
      {payer && <PayerDetails payer={payer} />}
    </Modal>
  );
}

function PayerDetails(props: { payer: Organization }): JSX.Element {
  const { payer } = props;
  const category = getPayerCategory(payer);
  const address = payer.address?.[0];
  const addressText =
    address &&
    [address.line?.join(', '), address.city, [address.state, address.postalCode].filter(Boolean).join(' ')]
      .filter(Boolean)
      .join(', ');
  const supportBadges = PAYER_SUPPORT_CAPABILITIES.map(({ url, label }) => ({
    label,
    state: SUPPORT_STATE_LABELS[payer.extension?.find((e) => e.url === url)?.valueCode ?? ''],
  })).filter((entry) => entry.state);

  return (
    <Stack gap="md">
      <Stack gap="sm">
        <div>
          <Text size="xs" c="dimmed">
            Payer ID
          </Text>
          <Text>{getIdentifier(payer, CHC_PAYER_ID_SYSTEM) ?? getIdentifier(payer, CMS_PAYER_ID_SYSTEM) ?? '—'}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">
            Category
          </Text>
          <Text>{category ? formatPayerCategory(category) : '—'}</Text>
        </div>
        {addressText && (
          <div>
            <Text size="xs" c="dimmed">
              Address
            </Text>
            <Text>{addressText}</Text>
          </div>
        )}
      </Stack>
      {supportBadges.length > 0 && (
        <div>
          <Text size="xs" c="dimmed" mb={4}>
            Clearinghouse support
          </Text>
          <Group gap="sm">
            {supportBadges.map(({ label, state }) => (
              <Badge key={label} color={state.color} variant="light">
                {label}: {state.label}
              </Badge>
            ))}
          </Group>
        </div>
      )}
      {!!payer.alias?.length && (
        <div>
          <Text size="xs" c="dimmed" mb={4}>
            Also known as
          </Text>
          <Text size="sm">{payer.alias.join(' · ')}</Text>
        </div>
      )}
    </Stack>
  );
}
