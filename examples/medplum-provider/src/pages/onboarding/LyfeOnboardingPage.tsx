// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Loader, Paper, Stack, Table, Tabs, Text, TextInput } from '@mantine/core';
import { IconAlertCircle, IconSearch, IconUserPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { LyfePageHeader } from '../../components/brand/LyfePageHeader';
import type { DrChronoPatientSummary } from '../../services/onboarding';
import { formatDrChronoName, searchDrChronoPatients } from '../../services/onboarding';
import { BulkImportPanel } from './BulkImportPanel';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 350;

/**
 * Step one of the Lyfe onboarding flow: find a patient in DrChrono.
 *
 * Importing is deliberately not wired up yet — the import runs DrChrono and Zus
 * pulls that take minutes, so it belongs in a Medplum Bot with a Task to track
 * progress, not in a request the browser holds open. See `services/onboarding.ts`.
 * @returns The onboarding search page.
 */
export function LyfeOnboardingPage(): JSX.Element {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DrChronoPatientSummary[]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const abortRef = useRef<AbortController>();
  const [tab, setTab] = useState<string | null>('search');

  useEffect(() => {
    const trimmed = query.trim();
    abortRef.current?.abort();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults(undefined);
      setLoading(false);
      setError(undefined);
      return undefined;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    const timer = setTimeout(() => {
      searchDrChronoPatients(trimmed, controller.signal)
        .then((found) => {
          setResults(found);
          setError(undefined);
        })
        .catch((err: Error) => {
          if (err.name !== 'AbortError') {
            setError(err.message);
            setResults(undefined);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <Stack gap="md" m="xs">
      <LyfePageHeader
        icon={<IconUserPlus size={20} />}
        eyebrow="Onboarding"
        title="New Patient"
        count={tab === 'search' ? results?.length : undefined}
        description="Search DrChrono for an existing record, or import a whole day's schedule"
      />

      <Tabs value={tab} onChange={setTab} variant="pills" radius="md">
        <Tabs.List grow mb="md">
          <Tabs.Tab value="search">Patient Search</Tabs.Tab>
          <Tabs.Tab value="bulk">Bulk Import</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="bulk">
          <Paper shadow="xs" p="md">
            <BulkImportPanel />
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="search">
          <Paper shadow="xs" p="md">
            <Stack gap="md">
              <TextInput
                size="md"
                radius="md"
                placeholder="Search DrChrono by name or chart ID…"
                leftSection={<IconSearch size={16} />}
                rightSection={loading ? <Loader size="xs" /> : undefined}
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                aria-label="Search DrChrono patients"
              />

              {error && (
                <Alert color="red" icon={<IconAlertCircle size={16} />} title="Search failed">
                  {error}
                </Alert>
              )}

              {results?.length === 0 && !loading && (
                <Text c="gray.5" size="sm" ta="center" py="lg">
                  No DrChrono patients match “{query.trim()}”.
                </Text>
              )}

              {!!results?.length && (
                <Table highlightOnHover verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Date of birth</Table.Th>
                      <Table.Th>Chart ID</Table.Th>
                      <Table.Th>Contact</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {results.map((patient) => (
                      <Table.Tr key={patient.id}>
                        <Table.Td>
                          <Text fw={500} size="sm">
                            {formatDrChronoName(patient)}
                          </Text>
                          {patient.gender && (
                            <Text size="xs" c="gray.5">
                              {patient.gender}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{patient.dateOfBirth ?? '—'}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" color="gray" radius="sm">
                            {patient.chartId ?? patient.id}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{patient.email ?? '—'}</Text>
                          {patient.cellPhone && (
                            <Text size="xs" c="gray.5">
                              {patient.cellPhone}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td ta="right">
                          <Button size="xs" radius="md" disabled title="Import runs as a Medplum Bot — not yet enabled">
                            Import
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Stack>
          </Paper>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
