// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Group, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { MedplumClient, SearchRequest, WithId } from '@medplum/core';
import { DEFAULT_SEARCH_COUNT, formatSearchQuery, Operator, parseSearchRequest } from '@medplum/core';
import type { DocumentReference, Patient, Reference } from '@medplum/fhirtypes';
import { ResourceBoard } from '@medplum/react';
import { IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { showErrorNotification } from '../../utils/notifications';
import { DocumentDetailPanel } from './DocumentDetailPanel';
import { DocumentListItem } from './DocumentListItem';
import { DocumentSourceFilterMenu } from './DocumentSourceFilterMenu';
import type { DocumentSourceOption } from './DocumentSourceFilterMenu.utils';
import { isDocumentSourceFilter, matchDocumentSourceOption } from './DocumentSourceFilterMenu.utils';
import { UploadDocumentModal } from './UploadDocumentModal';

export function DocumentsPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { patientId, documentId } = useParams() as { patientId: string; documentId?: string };

  const [uploadOpened, { open: openUpload, close: closeUpload }] = useDisclosure(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // The URL is the source of truth for the FULL search sent to the Medplum client — filters,
  // sort, count, offset, and total. The subject filter is the one exception: the patient is
  // already in the path, so it stays out of the query string. Missing pieces are defaulted
  // here, and the effect below pins the normalized query back into the URL so the address bar
  // always shows exactly what is fetched.
  const { search, activeSource } = useMemo<{ search: SearchRequest; activeSource?: DocumentSourceOption }>(() => {
    const parsed = parseSearchRequest(`DocumentReference${location.search}`);
    // subject and status are page invariants — always rebuilt from the route, never trusted
    // from the URL. Everything else (e.g. the document source filters) passes through.
    const extraFilters = (parsed.filters ?? []).filter((f) => f.code !== 'subject' && f.code !== 'status');
    const search: SearchRequest = {
      resourceType: 'DocumentReference',
      filters: [
        { code: 'subject', operator: Operator.EQUALS, value: `Patient/${patientId}` },
        // Hide soft-deleted documents (delete marks them entered-in-error rather than removing them).
        { code: 'status', operator: Operator.NOT, value: 'entered-in-error' },
        ...extraFilters,
      ],
      sortRules:
        parsed.sortRules && parsed.sortRules.length > 0
          ? parsed.sortRules
          : [{ code: '_lastUpdated', descending: true }],
      count: parsed.count ?? DEFAULT_SEARCH_COUNT,
      offset: parsed.offset ?? 0,
      total: 'accurate',
    };
    return { search, activeSource: matchDocumentSourceOption(search.filters) };
  }, [location.search, patientId]);

  // Serializes a search for the URL: the subject filter is dropped because the patient id is
  // carried by the path.
  const toQuery = useCallback(
    (s: SearchRequest): string =>
      formatSearchQuery({ ...s, filters: (s.filters ?? []).filter((f) => f.code !== 'subject') }),
    []
  );

  // Pin the normalized search into the URL (history replace) whenever the URL is missing any
  // part of it. formatSearchQuery is deterministic, so this converges after one redirect, and
  // the pinned search is deep-equal to the pre-redirect one, so ResourceBoard's memoized
  // search does not refetch.
  useEffect(() => {
    const query = toQuery(search);
    if (query === location.search) {
      return;
    }
    const path = documentId
      ? `/Patient/${patientId}/DocumentReference/${documentId}`
      : `/Patient/${patientId}/DocumentReference`;
    navigate(`${path}${query}`, { replace: true })?.catch(console.error);
  }, [search, toQuery, location.search, documentId, patientId, navigate]);

  // Keep the current pagination query when navigating to a document.
  const docUri = useCallback(
    (docId: string | undefined): string => `/Patient/${patientId}/DocumentReference/${docId}${location.search}`,
    [patientId, location.search]
  );

  // Resolve an out-of-list selection silently (a stale/deleted id shouldn't toast).
  const resolveSelected = useCallback(
    async (
      id: string,
      items: WithId<DocumentReference>[],
      client: MedplumClient
    ): Promise<WithId<DocumentReference> | undefined> => {
      const found = items.find((d) => d.id === id);
      if (found) {
        return found;
      }
      try {
        return await client.readResource('DocumentReference', id);
      } catch {
        return undefined;
      }
    },
    []
  );

  const handleCreated = (doc: DocumentReference): void => {
    setRefreshKey((k) => k + 1);
    navigate(docUri(doc.id))?.catch(console.error);
  };

  const refreshList = useCallback((): void => setRefreshKey((k) => k + 1), []);

  // After a soft-delete, drop the (now-hidden) selection and reload so the next doc surfaces.
  const handleDeleted = useCallback((): void => {
    setRefreshKey((k) => k + 1);
    navigate(`/Patient/${patientId}/DocumentReference${location.search}`)?.catch(console.error);
  }, [navigate, patientId, location.search]);

  // The source filter is URL-driven like the rest of the search. Changing it resets pagination
  // and drops the selection so the first matching document surfaces.
  const handleSourceChange = useCallback(
    (source: DocumentSourceOption | undefined): void => {
      const filters = (search.filters ?? []).filter((f) => !isDocumentSourceFilter(f));
      if (source) {
        filters.push(...source.filters);
      }
      const query = toQuery({ ...search, filters, offset: 0 });
      navigate(`/Patient/${patientId}/DocumentReference${query}`)?.catch(console.error);
    },
    [search, toQuery, patientId, navigate]
  );

  const patientRef: Reference<Patient> = { reference: `Patient/${patientId}` };

  const headerActions = (
    <Group gap="xs" wrap="nowrap">
      <DocumentSourceFilterMenu value={activeSource} onChange={handleSourceChange} />
      <Tooltip label="Upload document" position="bottom" openDelay={500}>
        <ActionIcon
          aria-label="Upload document"
          radius="xl"
          variant="filled"
          color="blue"
          size={32}
          onClick={openUpload}
        >
          <IconPlus size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );

  return (
    <>
      <ResourceBoard<DocumentReference>
        search={search}
        selectedId={documentId}
        reloadKey={refreshKey}
        resolveSelected={resolveSelected}
        headerText={activeSource ? activeSource.headerText : 'All Documents'}
        headerActions={headerActions}
        renderItem={(doc) => (
          <DocumentListItem item={doc} selectedDocumentId={documentId} getItemUri={(item) => docUri(item.id)} />
        )}
        emptyList={<EmptyDocuments />}
        renderDetail={(doc) => (
          <DocumentDetailPanel
            item={doc}
            patientRef={patientRef}
            onDocumentChange={refreshList}
            onDocumentDeleted={handleDeleted}
          />
        )}
        emptyDetail={
          <Box flex={1} h="100%" p="lg">
            <Text c="dimmed">Select a document to view it.</Text>
          </Box>
        }
        onSelectFirst={(doc) => navigate(docUri(doc.id), { replace: true })?.catch(console.error)}
        onChange={(s) => navigate(`/Patient/${patientId}/DocumentReference${toQuery(s)}`)?.catch(console.error)}
        onError={showErrorNotification}
      />

      <UploadDocumentModal opened={uploadOpened} onClose={closeUpload} patient={patientRef} onCreated={handleCreated} />
    </>
  );
}

function EmptyDocuments(): JSX.Element {
  return (
    <Box h="100%" p="lg">
      <Text c="dimmed" fw={500}>
        No documents.
      </Text>
    </Box>
  );
}
