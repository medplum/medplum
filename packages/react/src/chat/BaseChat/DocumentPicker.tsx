// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Divider, Loader, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { getReferenceString } from '@medplum/core';
import type { DocumentReference, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconFileText, IconPaperclip } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';

export interface DocumentPickerProps {
  readonly subjectRef?: Reference;
  readonly onSelect: (doc: DocumentReference) => void;
  readonly onUpload: () => void;
}

export function DocumentPicker({ subjectRef, onSelect, onUpload }: DocumentPickerProps): JSX.Element {
  const medplum = useMedplum();
  const [search, setSearch] = useState('');
  const [docs, setDocs] = useState<DocumentReference[]>([]);
  const [loading, setLoading] = useState(true);
  const subjectRefStr = subjectRef ? getReferenceString(subjectRef) : undefined;

  const fetchDocs = useDebouncedCallback(async (query: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (subjectRefStr) {
        params.set('subject', subjectRefStr);
      }
      if (query.trim()) {
        params.set('description:contains', query.trim());
      }
      params.set('_sort', '-date');
      params.set('_count', '5');
      const results = await medplum.searchResources('DocumentReference', params);
      setDocs([...results]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, 300);

  useEffect(() => {
    fetchDocs(search);
  }, [fetchDocs, search]);

  const getDocName = (doc: DocumentReference): string =>
    doc.description ?? doc.content?.[0]?.attachment?.title ?? 'Untitled';

  return (
    <Stack gap={0} w={280}>
      <Text fw={500} fz="sm" px="sm" pt="sm" pb="xs">
        Attachments
      </Text>
      <Box px="sm" pb="xs">
        <TextInput
          placeholder="Search for a Document..."
          size="xs"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      </Box>
      <Divider />
      {loading ? (
        <Box py="sm" style={{ display: 'flex', justifyContent: 'center' }}>
          <Loader size="xs" />
        </Box>
      ) : (
        <Stack gap={0}>
          {docs.map((doc) => (
            <UnstyledButton
              key={doc.id}
              px="sm"
              py="xs"
              onClick={() => onSelect(doc)}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <IconFileText size="1rem" style={{ flexShrink: 0, color: 'var(--mantine-color-blue-6)' }} />
              <Text fz="sm" truncate>
                {getDocName(doc)}
              </Text>
            </UnstyledButton>
          ))}
          {docs.length === 0 && (
            <Text fz="xs" c="dimmed" px="sm" py="xs">
              No documents found
            </Text>
          )}
        </Stack>
      )}
      <Divider />
      <UnstyledButton px="sm" py="xs" onClick={onUpload} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <IconPaperclip size="1rem" style={{ flexShrink: 0, color: 'var(--mantine-color-gray-6)' }} />
        <Text fz="sm" c="dimmed">
          Upload an image, pdf, etc.
        </Text>
      </UnstyledButton>
    </Stack>
  );
}
