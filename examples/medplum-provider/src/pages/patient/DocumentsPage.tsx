// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Divider, Flex, Group, ScrollArea, Skeleton, Stack, Text, Tooltip } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import type { Communication, DocumentReference } from '@medplum/fhirtypes';
import { HEALTH_GORILLA_SYSTEM } from '@medplum/health-gorilla-core';
import { useMedplum } from '@medplum/react';
import { IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { DocumentDetailPanel } from '../../components/documents/DocumentDetailPanel';
import { DocumentFilterMenu } from '../../components/documents/DocumentFilterMenu';
import { DocumentListItem } from '../../components/documents/DocumentListItem';
import type { DocumentSource, PatientDocument } from '../../components/documents/DocumentListItem.utils';
import { isFaxMedium, toPatientDocument } from '../../components/documents/DocumentListItem.utils';
import { DocumentSelectEmpty } from '../../components/documents/DocumentSelectEmpty';
import { usePatient } from '../../hooks/usePatient';
import { showErrorNotification } from '../../utils/notifications';
import classes from './DocumentsPage.module.css';

function getDocumentItemId(docId: string): string {
  return `document-item-${docId}`;
}

function isDocumentListItem(element: Element | null | undefined): element is HTMLElement {
  return element instanceof HTMLElement && element.id.startsWith('document-item-');
}

function getActiveDocumentIndex(filteredDocs: PatientDocument[], documentId: string | undefined): number {
  if (isDocumentListItem(document.activeElement)) {
    const focusedId = document.activeElement.id.slice('document-item-'.length);
    const focusedIndex = filteredDocs.findIndex((doc) => doc.id === focusedId);
    if (focusedIndex >= 0) {
      return focusedIndex;
    }
  }

  return filteredDocs.findIndex((doc) => doc.id === documentId);
}

// Stedi tags its artifacts with an identifier whose system is a stedi.com URL. Match on the parsed
// hostname (exact host or a subdomain) rather than a substring, so lookalike hosts such as
// "stedi.com.evil.example" or "notstedi.com" don't slip through.
function isStediIdentifierSystem(system: string | undefined): boolean {
  if (!system) {
    return false;
  }
  try {
    const host = new URL(system).hostname;
    return host === 'stedi.com' || host.endsWith('.stedi.com');
  } catch {
    return false;
  }
}

function isHGLabArtifact(doc: DocumentReference): boolean {
  const hasHGCategory = doc.category?.some((cat) =>
    cat.coding?.some((c) => c.system === 'https://www.medplum.com/integrations/health-gorilla/document-type')
  );
  if (hasHGCategory) {
    return true;
  }

  const isDebugLog = doc.category?.some((cat) => cat.text?.startsWith('HG Debug Log'));
  if (isDebugLog) {
    return true;
  }

  // Health Gorilla artifacts carry an identifier under the Health Gorilla system, the same way
  // Stedi artifacts are tagged below. This is portable across environments (unlike a fixed bot id).
  const isHGIdentified = doc.identifier?.some((id) => id.system?.startsWith(HEALTH_GORILLA_SYSTEM));
  if (isHGIdentified) {
    return true;
  }

  const isAddendum = doc.type?.coding?.some((c) => c.display === 'Addendum Document');
  if (isAddendum) {
    return true;
  }

  const isStediArtifact = doc.identifier?.some((id) => isStediIdentifierSystem(id.system));
  if (isStediArtifact) {
    return true;
  }

  return false;
}

export function DocumentsPage(): JSX.Element {
  // Remount per patient so list, loading, and selection state never leak across patients.
  const { patientId } = useParams();
  return <DocumentsPageContent key={patientId} />;
}

function DocumentsPageContent(): JSX.Element {
  const { patientId, documentId } = useParams();
  const navigate = useNavigate();
  const medplum = useMedplum();
  const patient = usePatient();
  const patientReference = useMemo(() => (patient ? getReferenceString(patient) : undefined), [patient]);

  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  // Starts true: the page mounts (per patient, via the key above) before the first fetch resolves.
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedSources, setSelectedSources] = useState<DocumentSource[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldFocusSelectionRef = useRef(false);
  const shouldScrollSelectionRef = useRef(false);
  // Tracks which documents have already played the original-author fade this section visit, so
  // revisiting one (history now cached → resolves immediately) renders the clause statically. One
  // stable Set for the page's lifetime; it resets on remount, so re-entering the section animates again.
  const [fadedAuthorIds] = useState(() => new Set<string>());

  const fetchDocuments = useCallback(async (): Promise<void> => {
    if (!patientReference) {
      return;
    }

    try {
      const [docRefs, attachmentComms] = await Promise.all([
        medplum.searchResources(
          'DocumentReference',
          {
            patient: patientReference,
            _sort: '-_lastUpdated',
            _count: '100',
          },
          { cache: 'no-cache' }
        ),
        medplum.searchResources(
          'Communication',
          {
            subject: patientReference,
            _sort: '-sent',
            _count: '100',
          },
          { cache: 'no-cache' }
        ),
      ]);

      // Message attachments are stored as separate DocumentReferences and linked from the
      // message Communication via payload.contentReference. Collect those references so the
      // backing DocumentReferences can be classified as "Message" rather than "Upload".
      const messageDocRefRefs = new Set<string>();
      for (const comm of attachmentComms) {
        if (isFaxMedium(comm)) {
          continue;
        }
        for (const p of comm.payload ?? []) {
          if (p.contentReference?.reference) {
            messageDocRefRefs.add(p.contentReference.reference);
          }
        }
      }

      const allDocs: PatientDocument[] = [
        ...docRefs
          // entered-in-error is a soft delete: kept in the project, hidden from the list.
          .filter((d) => d.status !== 'entered-in-error' && !isHGLabArtifact(d))
          .map((d: DocumentReference) =>
            toPatientDocument(d, { asMessageAttachment: messageDocRefRefs.has(getReferenceString(d) ?? '') })
          ),
        ...attachmentComms
          .filter((c: Communication) => c.status !== 'entered-in-error' && c.payload?.some((p) => p.contentAttachment))
          .map((c: Communication) => toPatientDocument(c)),
      ];

      allDocs.sort((a, b) => {
        const aTime = a.date ? new Date(a.date).getTime() : 0;
        const bTime = b.date ? new Date(b.date).getTime() : 0;
        return bTime - aTime;
      });

      setDocuments(allDocs);
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setLoading(false);
    }
  }, [medplum, patientReference]);

  useEffect(() => {
    if (patientId) {
      // Fetch on mount / patient change. fetchDocuments only updates state after its await
      // resolves, so this is not the synchronous render loop the rule guards against.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchDocuments().catch(showErrorNotification);
    }
  }, [patientId, fetchDocuments]);

  const selectedDoc = useMemo(() => {
    if (!documentId || documents.length === 0) {
      return undefined;
    }
    return documents.find((doc) => doc.id === documentId);
  }, [documentId, documents]);

  useEffect(() => {
    // Once documents are loaded, make sure the URL points at a visible one. This covers both no
    // selection and a selection that no longer resolves (e.g. just soft-deleted, so filtered out).
    if (loading || documents.length === 0) {
      return;
    }
    const selectionResolves = documentId && documents.some((doc) => doc.id === documentId);
    if (!selectionResolves) {
      navigate(`/Patient/${patientId}/DocumentReference/${documents[0].id}`, { replace: true })?.catch(console.error);
    }
  }, [documentId, documents, loading, navigate, patientId]);

  useEffect(() => {
    if (!documentId || (!shouldFocusSelectionRef.current && !shouldScrollSelectionRef.current)) {
      return;
    }

    const moveFocus = shouldFocusSelectionRef.current;
    shouldFocusSelectionRef.current = false;
    shouldScrollSelectionRef.current = false;

    requestAnimationFrame(() => {
      const item = document.getElementById(getDocumentItemId(documentId));
      if (!item) {
        return;
      }

      item.scrollIntoView({ block: 'nearest' });
      if (moveFocus) {
        item.focus({ preventScroll: true });
      }
    });
  }, [documentId]);

  const getItemUri = useCallback(
    (item: PatientDocument): string => {
      return `/Patient/${patientId}/DocumentReference/${item.id}`;
    },
    [patientId]
  );

  const handleDocumentChange = (): void => {
    fetchDocuments().catch(showErrorNotification);
  };

  const handleDocumentDeleted = (): void => {
    // Refetch; the deleted document drops out of the list and the selection effect advances the
    // URL to the next visible document (or the empty state when none remain).
    fetchDocuments().catch(showErrorNotification);
  };

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
      const file = event.target.files?.[0];
      if (!file || !patientReference) {
        return;
      }

      setUploading(true);
      try {
        const binary = await medplum.createBinary(file, file.name, file.type);
        await medplum.createResource<DocumentReference>({
          resourceType: 'DocumentReference',
          status: 'current',
          subject: { reference: patientReference },
          date: new Date().toISOString(),
          description: file.name,
          content: [
            {
              attachment: {
                contentType: file.type,
                url: `Binary/${binary.id}`,
                title: file.name,
              },
            },
          ],
        });
        await fetchDocuments();
      } catch (error) {
        showErrorNotification(error);
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [medplum, patientReference, fetchDocuments]
  );

  const filteredDocs = useMemo(() => {
    if (selectedSources.length === 0) {
      return documents;
    }
    return documents.filter((doc) => selectedSources.includes(doc.source));
  }, [documents, selectedSources]);

  const navigateToDocument = useCallback(
    (doc: PatientDocument, options?: { moveFocus?: boolean; scroll?: boolean }): void => {
      if (options?.moveFocus) {
        shouldFocusSelectionRef.current = true;
      }
      if (options?.scroll) {
        shouldScrollSelectionRef.current = true;
      }
      navigate(getItemUri(doc))?.catch(console.error);
    },
    [navigate, getItemUri]
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return;
      }

      if (loading || filteredDocs.length === 0) {
        return;
      }

      event.preventDefault();

      const currentIndex = getActiveDocumentIndex(filteredDocs, documentId);
      let nextIndex: number;
      if (event.key === 'ArrowDown') {
        nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, filteredDocs.length - 1);
      } else {
        nextIndex = currentIndex < 0 ? filteredDocs.length - 1 : Math.max(currentIndex - 1, 0);
      }

      if (nextIndex === currentIndex) {
        return;
      }

      navigateToDocument(filteredDocs[nextIndex], {
        moveFocus: isDocumentListItem(document.activeElement),
        scroll: true,
      });
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [documentId, filteredDocs, loading, navigateToDocument]);

  const handleSourceToggle = useCallback((source: DocumentSource): void => {
    setSelectedSources((prev) => (prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]));
  }, []);

  const patientRef = patient ? ({ reference: `Patient/${patient.id}` } as const) : undefined;

  return (
    <div className={classes.layout}>
      <div className={classes.shell}>
        <Flex h={64} align="center" justify="space-between" px="lg">
          <span className={classes.headerText}>All Documents</span>
          <Group gap="xs">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              accept=".pdf,.png,.jpg,.jpeg,.tiff,.doc,.docx"
            />
            <DocumentFilterMenu
              sources={selectedSources}
              onSourceToggle={handleSourceToggle}
              onClearAllFilters={() => setSelectedSources([])}
            />
            <Tooltip label="Upload Document" position="bottom" openDelay={500}>
              <ActionIcon
                variant="filled"
                color="blue"
                size={32}
                radius="xl"
                loading={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <IconPlus size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Flex>

        <Divider />
        <ScrollArea style={{ flex: 1 }} id="document-list-scrollarea">
          {loading && <DocListSkeleton />}
          {!loading && filteredDocs.length === 0 && <EmptyDocsState />}
          {!loading && filteredDocs.length > 0 && (
            <Stack gap={2} p="xs" role="listbox" aria-label="All documents">
              {filteredDocs.map((item) => (
                <DocumentListItem
                  key={`${item.resourceType}-${item.id}`}
                  id={getDocumentItemId(item.id)}
                  item={item}
                  selectedDocumentId={documentId}
                  getItemUri={getItemUri}
                />
              ))}
            </Stack>
          )}
        </ScrollArea>
      </div>

      {selectedDoc ? (
        <DocumentDetailPanel
          key={selectedDoc.id}
          item={selectedDoc}
          patientRef={patientRef}
          onDocumentChange={handleDocumentChange}
          onDocumentDeleted={handleDocumentDeleted}
          fadedAuthorIds={fadedAuthorIds}
        />
      ) : (
        <div className={classes.detailColumn}>
          <DocumentSelectEmpty />
        </div>
      )}
    </div>
  );
}

function EmptyDocsState(): JSX.Element {
  return (
    <Flex direction="column" h="100%" justify="center" align="center" pt="xl">
      <Text c="dimmed" fw={500}>
        No documents to display.
      </Text>
    </Flex>
  );
}

function DocListSkeleton(): JSX.Element {
  return (
    <Stack gap="md" p="md">
      {Array.from({ length: 6 }).map((_, index) => (
        <Stack key={index} gap="xs">
          <Skeleton height={16} width={`${85 - index * 5}%`} />
          <Skeleton height={14} width={`${60 + index * 4}%`} />
        </Stack>
      ))}
    </Stack>
  );
}
