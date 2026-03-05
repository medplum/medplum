// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Flex,
  Paper,
  Group,
  Divider,
  ActionIcon,
  ScrollArea,
  Stack,
  Skeleton,
  Text,
  Box,
  Tabs,
  Tooltip,
} from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { Communication } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useNavigate, useSearchParams } from 'react-router';
import { IconSend } from '@tabler/icons-react';
import { isNotFound, OperationOutcomeError } from '@medplum/core';
import { showErrorNotification } from '../../utils/notifications';
import { FaxListItem } from './FaxListItem';
import type { FaxTab } from './FaxListItem';
import { FaxSelectEmpty } from './FaxSelectEmpty';
import { FaxDetailPanel } from './FaxDetailPanel';
import { SendFaxModal } from './SendFaxModal';
import classes from './FaxBoard.module.css';

interface FaxBoardProps {
  selectedFaxId: string | undefined;
  activeTab: FaxTab;
}

const FAX_MEDIUM = 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode|FAXWRIT';
const FAX_DIRECTION_SYSTEM = 'http://medplum.com/fhir/CodeSystem/fax-direction';

export function FaxBoard({ selectedFaxId, activeTab }: FaxBoardProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();

  const [faxes, setFaxes] = useState<Communication[]>([]);
  const [selectedFax, setSelectedFax] = useState<Communication | undefined>();
  const [loading, setLoading] = useState(false);
  const [sendModalOpened, setSendModalOpened] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const efaxPolledRef = useRef(false);

  const buildSearchParams = useCallback((): Record<string, string> => {
    const params: Record<string, string> = {
      medium: FAX_MEDIUM,
      _count: '50',
    };

    if (activeTab === 'inbox') {
      params.category = `${FAX_DIRECTION_SYSTEM}|inbound`;
      params['status:not'] = 'entered-in-error';
      params._sort = '-sent';
    } else if (activeTab === 'archived') {
      params.status = 'entered-in-error';
      params._sort = '-sent';
    } else if (activeTab === 'sent') {
      params.category = `${FAX_DIRECTION_SYSTEM}|outbound`;
      params['status:not'] = 'entered-in-error';
      params._sort = '-sent';
    }

    return params;
  }, [activeTab]);

  // Clear the list when switching tabs so the skeleton shows
  useEffect(() => {
    setFaxes([]);
  }, [activeTab]);

  // Fetch the fax list for the current tab
  useEffect(() => {
    let cancelled = false;

    const fetchList = async (): Promise<void> => {
      setLoading(true);
      try {
        const results = await medplum.searchResources('Communication', buildSearchParams(), { cache: 'no-cache' });
        if (!cancelled) {
          const sorted = [...results.filter((f) => f.sent), ...results.filter((f) => !f.sent)];
          setFaxes(sorted);
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

    return () => { cancelled = true; };
  }, [activeTab, refreshKey, medplum, buildSearchParams]);

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

  const buildFaxUrl = useCallback(
    (faxId?: string): string => {
      const base = faxId ? `/Fax/Communication/${faxId}` : '/Fax/Communication';
      return activeTab === 'inbox' ? base : `${base}?tab=${activeTab}`;
    },
    [activeTab]
  );

  useEffect(() => {
    if (!loading && faxes.length > 0 && !selectedFaxId) {
      const firstFax = faxes[0];
      if (firstFax?.id) {
        navigate(buildFaxUrl(firstFax.id))?.catch(console.error);
      }
    }
  }, [loading, faxes, selectedFaxId, navigate, buildFaxUrl]);

  useEffect(() => {
    const selectFax = async (): Promise<void> => {
      if (selectedFaxId) {
        const fax = faxes.find((f) => f.id === selectedFaxId);
        if (fax) {
          setSelectedFax(fax);
        } else {
          try {
            const fax = await medplum.readResource('Communication', selectedFaxId);
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
  }, [selectedFaxId, faxes, medplum]);

  const getFaxUri = useCallback(
    (fax: Communication): string => buildFaxUrl(fax.id),
    [buildFaxUrl]
  );

  const handleTabChange = (value: string | null): void => {
    if (value) {
      if (value === 'inbox') {
        setSearchParams({});
      } else {
        setSearchParams({ tab: value });
      }
    }
  };

  const refreshList = useCallback((): void => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleFaxChange = (): void => {
    refreshList();
  };

  const handleFaxArchived = useCallback((updatedFax: Communication): void => {
    setSelectedFax(updatedFax);
    setFaxes((prev) => prev.filter((f) => f.id !== updatedFax.id));
    setRefreshKey((k) => k + 1);
  }, []);

  const handleFaxSent = (): void => {
    if (activeTab === 'sent') {
      refreshList();
    }
  };

  return (
    <Box w="100%" h="100%">
      <Flex h="100%">
        <Box w={350} h="100%">
          <Flex direction="column" h="100%" className={classes.borderRight}>
            <Paper>
              <Flex h={64} align="center" justify="space-between" p="md">
                <Tabs
                  value={activeTab}
                  onChange={handleTabChange}
                  variant="unstyled"
                  className="pill-tabs"
                >
                  <Tabs.List>
                    <Tabs.Tab value="inbox">Received</Tabs.Tab>
                    <Tabs.Tab value="sent">Sent</Tabs.Tab>
                    <Tabs.Tab value="archived">Archived</Tabs.Tab>
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
          <FaxDetailPanel fax={selectedFax} onFaxChange={handleFaxChange} onFaxArchived={handleFaxArchived} />
        ) : (
          <Flex direction="column" h="100%" style={{ flex: 1 }}>
            <FaxSelectEmpty />
          </Flex>
        )}
      </Flex>

      <SendFaxModal
        opened={sendModalOpened}
        onClose={() => setSendModalOpened(false)}
        onFaxSent={handleFaxSent}
      />
    </Box>
  );
}

function EmptyFaxState({ activeTab }: { activeTab: FaxTab }): JSX.Element {
  const labels: Record<FaxTab, string> = {
    inbox: 'No faxes in your inbox.',
    archived: 'No archived faxes.',
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
