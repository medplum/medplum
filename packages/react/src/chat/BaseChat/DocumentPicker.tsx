// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Loader, Menu, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import type { DocumentReference, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconFileText } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import classes from './BaseChat.module.css';

const MAX_RESULTS = 5;

export interface DocumentPickerListProps {
  readonly subjectRef?: Reference;
  readonly onSelect: (doc: DocumentReference) => void;
}

export function truncateMiddle(name: string, maxLen: number): string {
  if (name.length <= maxLen) {
    return name;
  }
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex === -1) {
    return name.slice(0, maxLen - 1) + '…';
  }
  const ext = name.slice(dotIndex + 1);
  const available = maxLen - ext.length - 2;
  if (available < 4) {
    return name.slice(0, maxLen - 1) + '…';
  }
  return name.slice(0, available) + '….' + ext;
}

export function DocumentPickerList({ subjectRef, onSelect }: DocumentPickerListProps): JSX.Element {
  const medplum = useMedplum();
  const [search, setSearch] = useState('');
  const [docs, setDocs] = useState<DocumentReference[]>([]);
  const [loading, setLoading] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const subjectRefStr = subjectRef ? getReferenceString(subjectRef) : undefined;

  // Focus the search input as soon as the recent-documents view opens
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const loadDocs = useCallback(
    async (query: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (subjectRefStr) {
          params.set('subject', subjectRefStr);
        }
        params.set('_sort', '-date');
        const trimmed = query.trim().toLowerCase();
        if (trimmed) {
          params.set('_count', '50');
          const results = await medplum.searchResources('DocumentReference', params);
          const filtered = [...results]
            .filter((doc) => {
              const description = doc.description?.toLowerCase() ?? '';
              const title = doc.content?.[0]?.attachment?.title?.toLowerCase() ?? '';
              return description.includes(trimmed) || title.includes(trimmed);
            })
            .slice(0, MAX_RESULTS);
          setDocs(filtered);
        } else {
          params.set('_count', String(MAX_RESULTS));
          const results = await medplum.searchResources('DocumentReference', params);
          setDocs([...results]);
        }
      } catch (err) {
        showNotification({ color: 'red', message: normalizeErrorString(err) });
      } finally {
        setLoading(false);
      }
    },
    [medplum, subjectRefStr]
  );

  const debouncedLoadDocs = useDebouncedCallback((query: string) => {
    // loadDocs handles its own errors internally; the catch only satisfies no-floating-promises
    loadDocs(query).catch(() => undefined);
  }, 300);

  // Fetch immediately on mount (when attach menu opens), debounce subsequent search changes
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      loadDocs(search).catch(() => undefined);
    } else {
      debouncedLoadDocs(search);
    }
  }, [search, loadDocs, debouncedLoadDocs]);

  const getDocName = (doc: DocumentReference): string =>
    doc.description ?? doc.content?.[0]?.attachment?.title ?? 'Untitled';

  const stopEvents = {
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
  };

  return (
    <Stack gap={0}>
      <Menu.Label>Recent Documents</Menu.Label>
      {loading ? (
        <Box py="sm" style={{ display: 'flex', justifyContent: 'center' }}>
          <Loader size="xs" />
        </Box>
      ) : (
        <Stack gap={0}>
          {docs.map((doc) => {
            const fullName = getDocName(doc);
            const displayName = truncateMiddle(fullName, 24);
            const isTruncated = displayName !== fullName;
            return (
              <Tooltip key={doc.id} label={fullName} disabled={!isTruncated} openDelay={400} position="top">
                <Menu.Item
                  className={classes.truncatedMenuItem}
                  leftSection={<IconFileText size={16} color="var(--mantine-color-dimmed)" />}
                  onClick={() => onSelect(doc)}
                >
                  <Text fz="sm" truncate>
                    {displayName}
                  </Text>
                </Menu.Item>
              </Tooltip>
            );
          })}
          {docs.length === 0 && (
            <Text fz="sm" c="dimmed" px="sm" py="xs">
              No documents found
            </Text>
          )}
        </Stack>
      )}
      <Box px="xs" pt={8} pb="xs" {...stopEvents}>
        <TextInput
          ref={searchRef}
          placeholder="Search documents..."
          size="sm"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </Box>
    </Stack>
  );
}
