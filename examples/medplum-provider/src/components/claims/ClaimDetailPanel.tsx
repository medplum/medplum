// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Divider, Flex, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { formatMoney } from '@medplum/core';
import type { Claim, ClaimResponse } from '@medplum/fhirtypes';
import { MedplumLink, ResourceTable, StatusBadge, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { getClaimTitle } from './claims.utils';

interface ClaimDetailPanelProps {
  readonly claim: Claim;
}

export function ClaimDetailPanel({ claim }: ClaimDetailPanelProps): JSX.Element {
  const medplum = useMedplum();
  const [response, setResponse] = useState<ClaimResponse | undefined>();
  const [responseLoading, setResponseLoading] = useState(true);

  // The page mounts a fresh panel per claim (keyed by id), so the fetch runs once
  // on mount and the initial state already reflects the loading/empty baseline.
  useEffect(() => {
    let active = true;

    medplum
      .searchResources('ClaimResponse', { request: `Claim/${claim.id}`, _sort: '-_lastUpdated', _count: '1' }, { cache: 'no-cache' })
      .then((results) => {
        if (active) {
          setResponse(results[0]);
        }
      })
      .catch((error) => {
        if (active) {
          showErrorNotification(error);
        }
      })
      .finally(() => {
        if (active) {
          setResponseLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [medplum, claim.id]);

  return (
    <Box h="100%" style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
      <Paper h="100%">
        <Flex direction="column" h="100%">
          <Box p="md">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Text fw={700} size="lg" truncate>
                {getClaimTitle(claim)}
              </Text>
              {claim.status && <StatusBadge status={claim.status} />}
            </Group>
          </Box>

          <Divider />

          <Box style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }} p="md">
            <Stack gap="lg">
              <Stack gap="xs">
                <Group justify="space-between" align="center">
                  <Text fw={600} size="sm" tt="uppercase" c="dimmed">
                    Claim
                  </Text>
                  <MedplumLink to={`/Claim/${claim.id}`}>View resource</MedplumLink>
                </Group>
                <ResourceTable value={claim} ignoreMissingValues />
              </Stack>

              <Divider />

              <Stack gap="xs">
                <Group justify="space-between" align="center">
                  <Text fw={600} size="sm" tt="uppercase" c="dimmed">
                    Claim Response
                  </Text>
                  {response && (
                    <MedplumLink to={`/ClaimResponse/${response.id}`}>View resource</MedplumLink>
                  )}
                </Group>

                {responseLoading && (
                  <Group gap="xs">
                    <Loader size="sm" />
                    <Text size="sm" c="dimmed">
                      Loading response…
                    </Text>
                  </Group>
                )}

                {!responseLoading && !response && (
                  <Text size="sm" c="dimmed">
                    No claim response has been received for this claim yet.
                  </Text>
                )}

                {!responseLoading && response && (
                  <Stack gap="sm">
                    <Group gap="lg">
                      {response.outcome && (
                        <Group gap="xs">
                          <Text size="sm" c="dimmed">
                            Outcome
                          </Text>
                          <StatusBadge status={response.outcome} />
                        </Group>
                      )}
                      {response.payment?.amount && (
                        <Group gap="xs">
                          <Text size="sm" c="dimmed">
                            Payment
                          </Text>
                          <Text size="sm" fw={500}>
                            {formatMoney(response.payment.amount)}
                          </Text>
                        </Group>
                      )}
                    </Group>
                    {response.disposition && <Text size="sm">{response.disposition}</Text>}
                    <ResourceTable value={response} ignoreMissingValues />
                  </Stack>
                )}
              </Stack>
            </Stack>
          </Box>
        </Flex>
      </Paper>
    </Box>
  );
}
