// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Box,
  Divider,
  Flex,
  Group,
  Paper,
  ScrollArea,
  Skeleton,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from '@mantine/core';
import { isNotFound, OperationOutcomeError } from '@medplum/core';
import type { Communication } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconSend } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { showErrorNotification } from '../../utils/notifications';
import classes from './FaxBoard.module.css';
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

  return (
    <Box w="100%" h="100%">
      <Flex h="100%">
        <Box w={350} h="100%">
          <Flex direction="column" h="100%" className={classes.borderRight}>
            <Paper>
              <Flex h={64} align="center" justify="space-between" p="md">
                <Tabs value={activeTab} onChange={handleTabChange} variant="unstyled" className="pill-tabs">
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
              </Flex>
            </Paper>

            <Divider />
            <Paper style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ScrollArea style={{ flex: 1 }} id="fax-list-scrollarea">
                <Box p={10}>
                  {loading && faxes.length === 0 && <FaxListSkeleton />}
                  {!loading && faxes.length === 0 && <EmptyFaxState activeTab={activeTab} />}
                  {faxes.length > 0 &&
                    faxes.map((fax, index) => {
                      const isSelected = selectedFax?.id === fax.id;
                      const nextIsSelected = index < faxes.length - 1 && selectedFax?.id === faxes[index + 1]?.id;

                      return (
                        <FaxListItem
                          key={fax.id}
                          fax={fax}
                          selectedFax={selectedFax}
                          activeTab={activeTab}
                          getFaxUri={getFaxUri}
                          hideDivider={isSelected || nextIsSelected}
                        />
                      );
                    })}
                </Box>
              </ScrollArea>
            </Paper>
          </Flex>
        </Box>

        {selectedFax ? (
          <FaxDetailPanel fax={selectedFax} onFaxChange={refreshList} />
        ) : (
          <Flex direction="column" h="100%" style={{ flex: 1 }}>
            <FaxSelectEmpty />
          </Flex>
        )}
      </Flex>

      <SendFaxModal opened={sendModalOpened} onClose={() => setSendModalOpened(false)} onFaxSent={handleFaxSent} />
    </Box>
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

const SKELETON_WIDTHS = [
  ['85%', '60%', '72%'],
  ['70%', '80%', '55%'],
  ['92%', '50%', '65%'],
  ['78%', '68%', '58%'],
  ['88%', '45%', '75%'],
  ['74%', '70%', '62%'],
];

function FaxListSkeleton(): JSX.Element {
  return (
    <Stack gap="md" p="md">
      {SKELETON_WIDTHS.map((widths, index) => (
        <Stack key={index}>
          <Flex direction="column" gap="xs" align="flex-start">
            <Skeleton height={16} width={widths[0]} />
            <Skeleton height={14} width={widths[1]} />
            <Skeleton height={14} width={widths[2]} />
          </Flex>
          <Divider />
        </Stack>
      ))}
    </Stack>
  );
}
