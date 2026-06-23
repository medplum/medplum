// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Loader, Menu, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { getDisplayString } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { ResourceAvatar, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';

const MAX_RESULTS = 5;

export interface PatientPickerProps {
  readonly excludeIds?: string[];
  readonly onSelect: (patient: Patient) => void;
}

export function PatientPicker({ excludeIds, onSelect }: PatientPickerProps): JSX.Element {
  const medplum = useMedplum();
  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  const excludeSet = useMemo(() => new Set(excludeIds ?? []), [excludeIds]);

  const loadPatients = useCallback(
    async (query: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('_sort', '-_lastUpdated');
        params.set('_count', String(MAX_RESULTS + (excludeIds?.length ?? 0)));
        const trimmed = query.trim();
        if (trimmed) {
          params.set('name', trimmed);
        }
        const results = await medplum.searchResources('Patient', params);
        setPatients([...results]);
      } catch (err) {
        showErrorNotification(err);
      } finally {
        setLoading(false);
      }
    },
    [medplum, excludeIds?.length]
  );

  const debouncedLoadPatients = useDebouncedCallback((query: string) => {
    // loadPatients handles its own errors internally; the catch only satisfies no-floating-promises
    loadPatients(query).catch(() => undefined);
  }, 300);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      loadPatients(search).catch(() => undefined);
    } else {
      debouncedLoadPatients(search);
    }
  }, [search, loadPatients, debouncedLoadPatients]);

  const filteredPatients = useMemo(
    () => patients.filter((p) => !excludeSet.has(p.id as string)).slice(0, MAX_RESULTS),
    [patients, excludeSet]
  );

  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  const stopEvents = {
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
  };

  return (
    <Stack gap={0}>
      <Menu.Label style={{ padding: 'calc(var(--mantine-spacing-xs) / 2) var(--mantine-spacing-xs)' }}>
        Patients
      </Menu.Label>
      {loading ? (
        <Box py="sm" style={{ display: 'flex', justifyContent: 'center' }}>
          <Loader size="xs" />
        </Box>
      ) : (
        <Stack gap={0}>
          {filteredPatients.map((patient) => {
            const displayName = getDisplayString(patient);
            return (
              <Tooltip
                key={patient.id}
                label={displayName}
                disabled={displayName.length <= 28}
                openDelay={400}
                position="top"
              >
                <Menu.Item
                  leftSection={<ResourceAvatar value={patient} size={24} radius="xl" />}
                  onClick={() => onSelect(patient)}
                  style={{ padding: 'calc(var(--mantine-spacing-xs) / 1.5) var(--mantine-spacing-xs)' }}
                >
                  <Text fz="sm" truncate>
                    {displayName}
                  </Text>
                </Menu.Item>
              </Tooltip>
            );
          })}
          {filteredPatients.length === 0 && (
            <Text fz="sm" c="dimmed" px="sm" py="xs">
              No patients found
            </Text>
          )}
        </Stack>
      )}
      <Box px="xs" pt={8} pb="xs" {...stopEvents}>
        <TextInput
          ref={searchRef}
          placeholder="Search patients..."
          size="sm"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </Box>
    </Stack>
  );
}
