// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Box, Button, Group, Paper, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { useMedplum } from '@medplum/react';
import { IconAlertCircle, IconDatabase, IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import type { BulkImportCandidate } from '../../services/onboarding';
import { DRCHRONO_IDENTIFIER_SYSTEM, formatDrChronoName, previewBulkImport } from '../../services/onboarding';

const today = (): string => new Date().toISOString().slice(0, 10);

interface PreviewState {
  readonly scannedAppointments: number;
  readonly candidates: BulkImportCandidate[];
  /** DrChrono ids already present in Medplum, so the UI can show what is genuinely new. */
  readonly existing: ReadonlySet<string>;
}

/**
 * Import every patient on a day's schedule, rather than one name at a time.
 *
 * Preview is deliberately separate from import: a clinic day can be a hundred
 * charts, and each one pulls minutes of DrChrono and Zus data, so the count is
 * confirmed before anything is written.
 * @returns The bulk import panel.
 */
export function BulkImportPanel(): JSX.Element {
  const medplum = useMedplum();
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<PreviewState>();

  const runPreview = useCallback(() => {
    setLoading(true);
    setError(undefined);
    setPreview(undefined);

    previewBulkImport(start, end || undefined)
      .then(async (result) => {
        // One search rather than N: FHIR treats comma-separated values as OR, so
        // the whole day's roster is checked for existing charts in a single call.
        const existing = new Set<string>();
        if (result.candidates.length > 0) {
          const ids = result.candidates.map((c) => c.id).join(',');
          const found = await medplum.searchResources(
            'Patient',
            `identifier=${encodeURIComponent(`${DRCHRONO_IDENTIFIER_SYSTEM}|`)}${ids}&_count=1000`
          );
          for (const p of found) {
            const value = p.identifier?.find((i) => i.system === DRCHRONO_IDENTIFIER_SYSTEM)?.value;
            if (value) {
              existing.add(value);
            }
          }
        }
        setPreview({ ...result, existing });
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [medplum, start, end]);

  const newCount = preview ? preview.candidates.filter((c) => !preview.existing.has(String(c.id))).length : 0;

  return (
    <Stack gap="md">
      <Box>
        <Text fw={600} size="lg" c="gray.9">
          Bulk Patient Import
        </Text>
        <Text size="sm" c="gray.5">
          Import all patients from a specific appointment date
        </Text>
      </Box>

      <Alert variant="light" color="gray" icon={<IconDatabase size={16} />}>
        Select an appointment date to import all patients from that day. Only new patients will be imported (existing
        patients are skipped).
      </Alert>

      <Box>
        <Text fw={600} size="sm" c="gray.9" mb="xs">
          Appointment Date Range
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <TextInput label="Start Date" type="date" value={start} onChange={(e) => setStart(e.currentTarget.value)} />
          <TextInput
            label="End Date (Optional)"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.currentTarget.value)}
          />
          <Box style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Button
              fullWidth
              leftSection={<IconSearch size={16} />}
              loading={loading}
              disabled={!start}
              onClick={runPreview}
            >
              Preview
            </Button>
          </Box>
        </SimpleGrid>
        <Text size="xs" c="gray.5" mt={6}>
          Fetch appointments from {start}
          {end && end !== start ? ` to ${end}` : ''} (excluding Cancelled/Rescheduled/No Show)
        </Text>
      </Box>

      {error && (
        <Alert color="red" icon={<IconAlertCircle size={16} />} title="Preview failed">
          {error}
        </Alert>
      )}

      {preview && (
        <Paper withBorder p="md" radius="md">
          <Group gap="lg" mb="sm">
            <Stat label="Appointments scanned" value={preview.scannedAppointments} />
            <Stat label="Patients found" value={preview.candidates.length} />
            <Stat label="New to import" value={newCount} highlight />
            <Stat label="Already in Medplum" value={preview.candidates.length - newCount} />
          </Group>

          {preview.candidates.length > 0 && (
            <Table highlightOnHover verticalSpacing="xs" mt="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Date of birth</Table.Th>
                  <Table.Th>Chart ID</Table.Th>
                  <Table.Th>Appts</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {preview.candidates.map((c) => {
                  const already = preview.existing.has(String(c.id));
                  return (
                    <Table.Tr key={c.id}>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {formatDrChronoName(c)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{c.dateOfBirth ?? '—'}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="default" radius="sm" style={{ textTransform: 'none', fontWeight: 500 }}>
                          {c.chartId ?? c.id}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{c.appointments}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          variant="light"
                          radius="sm"
                          color={already ? 'gray' : 'teal'}
                          style={{ textTransform: 'none', fontWeight: 500 }}
                        >
                          {already ? 'Skip — already imported' : 'New'}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          )}

          <Group justify="flex-end" mt="md">
            <Button disabled title="Import runs as a Medplum Bot — not yet enabled on this project">
              Start Bulk Import ({newCount})
            </Button>
          </Group>
        </Paper>
      )}
    </Stack>
  );
}

/**
 * A single labelled figure in the preview summary.
 * @param props - Component props.
 * @param props.label - What the figure counts.
 * @param props.value - The figure itself.
 * @param props.highlight - Renders the value in the primary colour.
 * @returns The stat element.
 */
function Stat(props: { readonly label: string; readonly value: number; readonly highlight?: boolean }): JSX.Element {
  return (
    <Box>
      <Text fz={11} fw={600} c="gray.5" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {props.label}
      </Text>
      <Text fz={24} fw={600} c={props.highlight ? 'primary.6' : 'gray.9'}>
        {props.value}
      </Text>
    </Box>
  );
}
