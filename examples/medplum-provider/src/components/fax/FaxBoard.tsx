// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Flex, Text, Tooltip } from '@mantine/core';
import type { MedplumClient, SearchRequest, WithId } from '@medplum/core';
import { isNotFound, OperationOutcomeError, parseSearchRequest } from '@medplum/core';
import type { Communication } from '@medplum/fhirtypes';
import { ResourceBoard, useMedplum } from '@medplum/react';
import { IconSend } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { showErrorNotification } from '../../utils/notifications';
import { FaxDetailPanel } from './FaxDetailPanel';
import type { FaxTab } from './FaxListItem';
import { FaxListItem } from './FaxListItem';
import { FaxSelectEmpty } from './FaxSelectEmpty';
import { SendFaxModal } from './SendFaxModal';

interface FaxBoardProps {
  faxId: string | undefined;
  activeTab: FaxTab;
  inboxUri: string;
  sentUri: string;
  query: string;
  getFaxUri: (fax: Communication) => string;
  onNew: (fax: Communication) => void;
  onChange: (search: SearchRequest) => void;
}

export function FaxBoard({
  faxId,
  activeTab,
  inboxUri,
  sentUri,
  query,
  getFaxUri,
  onNew,
  onChange,
}: FaxBoardProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();

  const [sendModalOpened, setSendModalOpened] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const efaxPolledRef = useRef(false);

  const currentSearch = useMemo(() => parseSearchRequest(`Communication?${query}`), [query]);

  const refreshList = useCallback((): void => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Resolve an out-of-list selection silently (a stale/deleted fax id shouldn't toast).
  const resolveSelected = useCallback(
    async (
      id: string,
      items: WithId<Communication>[],
      client: MedplumClient
    ): Promise<WithId<Communication> | undefined> => {
      const found = items.find((f) => f.id === id);
      if (found) {
        return found;
      }
      try {
        return await client.readResource('Communication', id);
      } catch {
        return undefined;
      }
    },
    []
  );

  // Poll eFax once on mount, then refresh the list when done.
  useEffect(() => {
    if (efaxPolledRef.current) {
      return;
    }
    efaxPolledRef.current = true;

    const pollEfax = async (): Promise<void> => {
      const receiveEfaxUrl = medplum.fhirUrl('Communication', '$receive-efax');
      try {
        await medplum.post(receiveEfaxUrl, {});
      } catch (efaxErr) {
        if (!(efaxErr instanceof OperationOutcomeError && isNotFound(efaxErr.outcome))) {
          showErrorNotification(efaxErr);
        }
        return;
      }
      refreshList();
    };
    pollEfax().catch(showErrorNotification);
  }, [medplum, refreshList]);

  const handleFaxSent = (fax: Communication): void => {
    onNew(fax);
    refreshList();
  };

  const tabs = [
    { value: 'inbox', label: 'Received', uri: inboxUri },
    { value: 'sent', label: 'Sent', uri: sentUri },
  ];

  const headerActions = (
    <Tooltip label="Send Fax" position="bottom" openDelay={500}>
      <ActionIcon radius="xl" variant="filled" color="blue" size={32} onClick={() => setSendModalOpened(true)}>
        <IconSend size={16} />
      </ActionIcon>
    </Tooltip>
  );

  return (
    <>
      <ResourceBoard<Communication>
        search={currentSearch}
        selectedId={faxId}
        reloadKey={refreshKey}
        resolveSelected={resolveSelected}
        tabs={tabs}
        activeTab={activeTab}
        headerActions={headerActions}
        renderItem={(fax, { selected }) => (
          <FaxListItem fax={fax} selectedFax={selected ? fax : undefined} activeTab={activeTab} getFaxUri={getFaxUri} />
        )}
        emptyList={<EmptyFaxState activeTab={activeTab} />}
        renderDetail={(fax) => <FaxDetailPanel fax={fax} onFaxChange={refreshList} />}
        emptyDetail={<FaxSelectEmpty />}
        onChange={onChange}
        onSelectFirst={(fax) => {
          navigate(getFaxUri(fax), { replace: true })?.catch(console.error);
        }}
        onError={showErrorNotification}
      />

      <SendFaxModal opened={sendModalOpened} onClose={() => setSendModalOpened(false)} onFaxSent={handleFaxSent} />
    </>
  );
}

function EmptyFaxState({ activeTab }: { activeTab: FaxTab }): JSX.Element {
  const labels: Record<FaxTab, string> = {
    inbox: 'No faxes in your inbox.',
    sent: 'No sent faxes.',
  };

  return (
    <Flex direction="column" h="100%" justify="center" align="center" pt="xl">
      <Text c="dimmed" fw={500}>
        {labels[activeTab]}
      </Text>
    </Flex>
  );
}
