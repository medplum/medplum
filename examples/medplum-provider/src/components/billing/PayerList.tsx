// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Group, Stack, Tabs, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { Modal } from '@medplum/react';
import { IconInfoCircle, IconRefresh } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useCandidPayerDirectory } from '../../hooks/useCandidPayerDirectory';
import { formatPayerCategory, getPayerCategory, getPayerId } from '../../utils/billing';
import {
  CANDID_ELIGIBILITY_SUPPORT_EXTENSION,
  CANDID_PROFESSIONAL_CLAIMS_SUPPORT_EXTENSION,
  CANDID_REMITTANCE_SUPPORT_EXTENSION,
} from '../../utils/candid';
import { ImportedPayerList } from './ImportedPayerList';
import { PayerDirectorySearch } from './PayerDirectorySearch';

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

export function PayerList(): JSX.Element {
  const directory = useCandidPayerDirectory();
  // A search result (not yet persisted, no id) or an imported payer (with id, refreshable).
  const [detailsPayer, setDetailsPayer] = useState<Organization | undefined>(undefined);

  const handleRefresh = async (org: WithId<Organization>): Promise<void> => {
    const updated = await directory.refreshPayer(org);
    if (updated) {
      setDetailsPayer(updated);
    }
  };

  return (
    <Stack gap="sm">
      <Tabs defaultValue="imported">
        <Tabs.List>
          <Tabs.Tab value="imported">Enrolled Payers</Tabs.Tab>
          <Tabs.Tab value="directory">Candid Payer Directory</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="imported" pt="md">
          <ImportedPayerList payers={directory.importedPayers} onSelectPayer={setDetailsPayer} />
        </Tabs.Panel>
        <Tabs.Panel value="directory" pt="md">
          {directory.botId === '' && (
            <Alert icon={<IconInfoCircle size={16} />} color="yellow" variant="light">
              The Candid payer directory bot is not deployed in this project, so payers cannot be searched or imported
              here.
            </Alert>
          )}
          {!!directory.botId && <PayerDirectorySearch directory={directory} onSelectPayer={setDetailsPayer} />}
        </Tabs.Panel>
      </Tabs>

      <Modal
        opened={detailsPayer !== undefined}
        onClose={() => setDetailsPayer(undefined)}
        title={detailsPayer?.name}
        size="lg"
        actions={
          // Only an imported (persisted) payer can be refreshed
          detailsPayer?.id !== undefined &&
          !!directory.botId && (
            <Group justify="flex-start" style={{ width: '100%' }}>
              <Button
                variant="outline"
                leftSection={<IconRefresh size={16} />}
                onClick={() => handleRefresh(detailsPayer as WithId<Organization>).catch(console.error)}
                loading={directory.refreshing}
              >
                Refresh from directory
              </Button>
            </Group>
          )
        }
      >
        {detailsPayer && <PayerDetails payer={detailsPayer} />}
      </Modal>
    </Stack>
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
          <Text>{getPayerId(payer) ?? '—'}</Text>
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
