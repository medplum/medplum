// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Text, Tooltip } from '@mantine/core';
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
import { UploadDocumentModal } from './UploadDocumentModal';

export function DocumentsPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { patientId, documentId } = useParams() as { patientId: string; documentId?: string };

  const [uploadOpened, { open: openUpload, close: closeUpload }] = useDisclosure(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Patient-scoped DocumentReference search. The page offset/count AND the sort are read from the
  // URL — sort is URL-driven, so deep links and the pagination round-trip stay authoritative. When
  // the URL carries no `_sort`, we fall back to most-recent-first (and the effect below pins that
  // default into the URL).
  const search = useMemo<SearchRequest>(() => {
    const parsed = parseSearchRequest(`DocumentReference${location.search}`);
    const sortRules =
      parsed.sortRules && parsed.sortRules.length > 0 ? parsed.sortRules : [{ code: '_lastUpdated', descending: true }];
    return {
      resourceType: 'DocumentReference',
      filters: [
        { code: 'subject', operator: Operator.EQUALS, value: `Patient/${patientId}` },
        // Hide soft-deleted documents (delete marks them entered-in-error rather than removing them).
        { code: 'status', operator: Operator.NOT, value: 'entered-in-error' },
      ],
      sortRules,
      count: parsed.count ?? DEFAULT_SEARCH_COUNT,
      offset: parsed.offset ?? 0,
    };
  }, [location.search, patientId]);

  // Sort is URL-driven; when the URL carries no `_sort`, pin the default into the URL (history
  // replace) so the address bar always reflects the active sort. The resulting search is deep-equal
  // to the pre-redirect one, so ResourceBoard's memoized search does not refetch.
  useEffect(() => {
    const parsed = parseSearchRequest(`DocumentReference${location.search}`);
    if (parsed.sortRules && parsed.sortRules.length > 0) {
      return;
    }
    const query = formatSearchQuery({
      ...parsed,
      resourceType: 'DocumentReference',
      sortRules: [{ code: '_lastUpdated', descending: true }],
    });
    navigate(`/Patient/${patientId}/DocumentReference${query}`, { replace: true })?.catch(console.error);
  }, [location.search, patientId, navigate]);

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

  const patientRef: Reference<Patient> = { reference: `Patient/${patientId}` };

  const headerActions = (
    <Tooltip label="Upload document" position="bottom" openDelay={500}>
      <ActionIcon aria-label="Upload document" radius="xl" variant="filled" color="blue" size={32} onClick={openUpload}>
        <IconPlus size={16} />
      </ActionIcon>
    </Tooltip>
  );

  return (
    <>
      <ResourceBoard<DocumentReference>
        search={search}
        selectedId={documentId}
        reloadKey={refreshKey}
        resolveSelected={resolveSelected}
        headerText="All Documents"
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
        onChange={(s) =>
          navigate(`/Patient/${patientId}/DocumentReference${formatSearchQuery(s)}`)?.catch(console.error)
        }
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
