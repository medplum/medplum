// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Group, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { Modal, useMedplum } from '@medplum/react';
import { IconInfoCircle, IconRefresh } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  CANDID_ELIGIBILITY_SUPPORT_EXTENSION,
  CANDID_PAYER_UUID_SYSTEM,
  CANDID_PROFESSIONAL_CLAIMS_SUPPORT_EXTENSION,
  CANDID_REMITTANCE_SUPPORT_EXTENSION,
  buildPayerRefreshOps,
  formatPayerCategory,
  getPayerCategory,
  getPayerId,
  getPayerUuid,
  isPayerNotFoundError,
} from '../../utils/billing';
import { CANDID_GET_PAYERS_BOT_IDENTIFIER } from '../../utils/candid';
import { showErrorNotification, showSuccessNotification } from '../../utils/notifications';
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
  const medplum = useMedplum();
  const [importedPayers, setImportedPayers] = useState<WithId<Organization>[]>([]);
  const [reload, setReload] = useState(0);
  // undefined = lookup pending, '' = bot not deployed
  const [botId, setBotId] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  // A search result (not yet persisted, no id) or an imported payer (with id, refreshable).
  const [detailsPayer, setDetailsPayer] = useState<Organization | undefined>(undefined);

  useEffect(() => {
    // Imported payers are recognized by the Candid payer UUID identifier stamped on import.
    medplum
      .searchResources('Organization', {
        identifier: `${CANDID_PAYER_UUID_SYSTEM}|`,
        _count: '100',
        _sort: 'name',
      })
      .then(setImportedPayers)
      .catch(showErrorNotification);
  }, [medplum, reload]);

  useEffect(() => {
    medplum
      .searchOne('Bot', {
        identifier: `${CANDID_GET_PAYERS_BOT_IDENTIFIER.system}|${CANDID_GET_PAYERS_BOT_IDENTIFIER.value}`,
      })
      .then((bot) => setBotId(bot?.id ?? ''))
      .catch(showErrorNotification);
  }, [medplum]);

  const importedUuids = useMemo(
    () => new Set(importedPayers.map(getPayerUuid).filter(Boolean) as string[]),
    [importedPayers]
  );

  const handleRefresh = async (org: WithId<Organization>): Promise<void> => {
    const payerUuid = getPayerUuid(org);
    if (!botId || !payerUuid) {
      return;
    }
    setRefreshing(true);
    try {
      const fresh = (await medplum.executeBot(botId, { payerUuid }, 'application/json')) as Organization;
      const ops = buildPayerRefreshOps(org, fresh);
      if (ops.length === 0) {
        showSuccessNotification({ title: 'Refresh complete', message: 'Payer is up to date with the directory' });
        return;
      }
      const updated = await medplum.patchResource('Organization', org.id, ops);
      setDetailsPayer(updated);
      setReload((r) => r + 1);
      showSuccessNotification({ title: 'Refresh complete', message: 'Payer updated from the directory' });
    } catch (error) {
      if (!isPayerNotFoundError(error)) {
        showErrorNotification(error);
      } else if (org.active === false) {
        showErrorNotification(new Error('This payer is still not in the Candid payer directory.'));
      } else {
        try {
          // Deactivate rather than delete: claims and coverages may reference the payer.
          const updated = await medplum.patchResource('Organization', org.id, [
            { op: 'add', path: '/active', value: false },
          ]);
          setDetailsPayer(updated);
          setReload((r) => r + 1);
          showErrorNotification(
            new Error('This payer is no longer in the Candid payer directory and has been marked inactive.')
          );
        } catch (patchError) {
          showErrorNotification(patchError);
        }
      }
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Stack gap="sm">
      {botId === '' && (
        <Alert icon={<IconInfoCircle size={16} />} color="yellow" variant="light">
          The Candid payer directory bot is not deployed in this project, so payers cannot be searched or imported here.
        </Alert>
      )}

      {!!botId && (
        <PayerDirectorySearch
          botId={botId}
          importedUuids={importedUuids}
          onImported={() => setReload((r) => r + 1)}
          onSelectPayer={setDetailsPayer}
        />
      )}

      <ImportedPayerList payers={importedPayers} onSelectPayer={setDetailsPayer} />

      <Modal
        opened={detailsPayer !== undefined}
        onClose={() => setDetailsPayer(undefined)}
        title={detailsPayer?.name}
        size="lg"
        actions={
          // Only an imported (persisted) payer can be refreshed
          detailsPayer?.id !== undefined &&
          !!botId && (
            <Group justify="flex-start" style={{ width: '100%' }}>
              <Button
                variant="outline"
                leftSection={<IconRefresh size={16} />}
                onClick={() => handleRefresh(detailsPayer as WithId<Organization>).catch(console.error)}
                loading={refreshing}
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
