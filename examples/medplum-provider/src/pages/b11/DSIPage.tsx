// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { JSX, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Card, Code, Group, Loader, Stack, Switch, Text, Title } from '@mantine/core';
import { Document, useMedplum } from '@medplum/react';
import { Subscription } from '@medplum/fhirtypes';
import { showErrorNotification } from '@/utils/notifications';

export function DSIPage(): JSX.Element {
  const medplum = useMedplum();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);

  const dsiSubscriptions = useMemo(() => {
    return subscriptions.filter((s) => s.reason?.toLowerCase().includes('dsi'));
  }, [subscriptions]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const results = await medplum.searchResources('Subscription', [['_count', '100']]);
      setSubscriptions(results as Subscription[]);
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setIsLoading(false);
    }
  }, [medplum]);

  useEffect(() => {
    refresh().catch((error) => showErrorNotification(error));
  }, [refresh]);

  async function toggle(sub: Subscription): Promise<void> {
    const current = sub.status;
    const next = current === 'active' ? 'off' : 'active';
    setIsLoading(true);
    try {
      await medplum.updateResource<Subscription>({ ...sub, status: next });
      await refresh();
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Document>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={1}>Decision Support Interventions</Title>
          {isLoading && <Loader size="sm" />}
        </Group>
        {!isLoading && dsiSubscriptions.length === 0 ? (
          <Alert color="gray" variant="light">
            No DSI Subscriptions found. Ensure your DSI Subscriptions have "DSI" in reason.
          </Alert>
        ) : (
          <Stack gap="sm">
            {dsiSubscriptions.map((s) => (
              <Card key={s.id} withBorder radius="md" padding="md">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Text fw={600} flex={1}>
                    {s.reason ?? 'DSI Subscription'}
                  </Text>
                  <Group gap="sm" align="center">
                    <Badge size="md" color={s.status === 'active' ? 'green' : 'red'} variant="light">
                      {s.status}
                    </Badge>
                    <Switch size="md" checked={s.status === 'active'} onChange={() => toggle(s)} disabled={isLoading} />
                  </Group>
                </Group>
                <Stack gap={4} mt="sm">
                  <Text size="sm">
                    ID: <Code>{s.id}</Code>
                  </Text>
                  <Text size="sm">
                    Criteria: <Code>{s.criteria}</Code>
                  </Text>
                  <Text size="sm">
                    Endpoint: <Code>{s.channel?.endpoint}</Code>
                  </Text>
                </Stack>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Document>
  );
}
