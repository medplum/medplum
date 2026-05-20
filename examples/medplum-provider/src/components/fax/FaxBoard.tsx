// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Group, Stack, Tabs, Tooltip } from '@mantine/core';
import { isNotFound, OperationOutcomeError } from '@medplum/core';
import type { Communication } from '@medplum/fhirtypes';
import {
  ListDetailLayout,
  ListEmptyState,
  ListScrollArea,
  ListShell,
  ListSkeleton,
  listClasses,
  useMedplum,
} from '@medplum/react';
import { IconSend } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
}

export function FaxBoard({ faxId, activeTab, inboxUri, sentUri, query, getFaxUri, onNew }: FaxBoardProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();

  const [faxes, setFaxes] = useState<Communication[]>([]);
  const [selectedFax, setSelectedFax] = useState<Communication | undefined>();
  const [loading, setLoading] = useState(false);
  const [sendModalOpened, setSendModalOpened] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const efaxPolledRef = useRef(false);
  const faxQueryRef = useRef('');

  // Clear the list when switching tabs so the skeleton shows
  useEffect(() => {
    setFaxes([]);
  }, [query]);

  // Fetch the fax list for the current tab
  useEffect(() => {
    let cancelled = false;

    const fetchList = async (): Promise<void> => {
      setLoading(true);
      try {
        const params = Object.fromEntries(new URLSearchParams(query));
        const results = await medplum.searchResources('Communication', params, { cache: 'no-cache' });
        if (!cancelled) {
          faxQueryRef.current = query;
          setFaxes(results);
        }
      } catch (error) {
        if (!cancelled) {
          showErrorNotification(error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    fetchList().catch(showErrorNotification);

    return () => {
      cancelled = true;
    };
  }, [query, refreshKey, medplum]);

  // Poll eFax once on mount, then refresh the list when done
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
      setRefreshKey((k) => k + 1);
    };
    pollEfax().catch(showErrorNotification);
  }, [medplum]);

  useEffect(() => {
    if (!loading && faxes.length > 0 && !faxId && faxQueryRef.current === query) {
      const firstFax = faxes[0];
      if (firstFax?.id) {
        navigate(getFaxUri(firstFax))?.catch(console.error);
      }
    }
  }, [loading, faxes, faxId, navigate, getFaxUri, query]);

  useEffect(() => {
    const selectFax = async (): Promise<void> => {
      if (faxId) {
        const fax = faxes.find((f) => f.id === faxId);
        if (fax) {
          setSelectedFax(fax);
        } else {
          try {
            const fax = await medplum.readResource('Communication', faxId);
            setSelectedFax(fax);
          } catch {
            setSelectedFax(undefined);
          }
        }
      } else {
        setSelectedFax(undefined);
      }
    };
    selectFax().catch(console.error);
  }, [faxId, faxes, medplum]);

  const handleTabChange = (value: string | null): void => {
    if (value === 'inbox') {
      navigate(inboxUri)?.catch(console.error);
    } else if (value === 'sent') {
      navigate(sentUri)?.catch(console.error);
    }
  };

  const refreshList = useCallback((): void => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleFaxSent = (fax: Communication): void => {
    onNew(fax);
    refreshList();
  };

  const faxEmptyMessage = activeTab === 'sent' ? 'No sent faxes.' : 'No faxes in your inbox.';

  return (
    <>
      <ListDetailLayout>
        <ListShell
          header={
            <>
              <Tabs value={activeTab} onChange={handleTabChange} variant="unstyled" className={listClasses.pillTabs}>
                <Tabs.List>
                  <Tabs.Tab value="inbox">Received</Tabs.Tab>
                  <Tabs.Tab value="sent">Sent</Tabs.Tab>
                </Tabs.List>
              </Tabs>
              <Group gap="xs">
                <Tooltip label="Send Fax" position="bottom" openDelay={500}>
                  <ActionIcon
                    radius="xl"
                    variant="filled"
                    color="blue"
                    size={32}
                    onClick={() => setSendModalOpened(true)}
                  >
                    <IconSend size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </>
          }
        >
          <ListScrollArea id="fax-list-scrollarea">
            {loading && faxes.length === 0 && <ListSkeleton />}
            {!loading && faxes.length === 0 && <ListEmptyState message={faxEmptyMessage} />}
            {faxes.length > 0 && (
              <Stack gap={2}>
                {faxes.map((fax) => (
                  <FaxListItem
                    key={fax.id}
                    fax={fax}
                    selectedFax={selectedFax}
                    activeTab={activeTab}
                    getFaxUri={getFaxUri}
                  />
                ))}
              </Stack>
            )}
          </ListScrollArea>
        </ListShell>

        {selectedFax ? (
          <FaxDetailPanel fax={selectedFax} onFaxChange={refreshList} />
        ) : (
          <ListDetailLayout.Column>
            <FaxSelectEmpty />
          </ListDetailLayout.Column>
        )}
      </ListDetailLayout>

      <SendFaxModal opened={sendModalOpened} onClose={() => setSendModalOpened(false)} onFaxSent={handleFaxSent} />
    </>
  );
}

