// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Box,
  Divider,
  Flex,
  Group,
  ActionIcon,
  Paper,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import type { Communication, DocumentReference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconPlus, IconSortDescending, IconSortAscending } from '@tabler/icons-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import { usePatient } from '../../hooks/usePatient';
import { showErrorNotification } from '../../utils/notifications';
import { DocumentListItem } from '../../components/documents/DocumentListItem';
import type { PatientDocument } from '../../components/documents/DocumentListItem.utils';
import { toPatientDocument } from '../../components/documents/DocumentListItem.utils';
import { DocumentDetailPanel } from '../../components/documents/DocumentDetailPanel';
import { DocumentSelectEmpty } from '../../components/documents/DocumentSelectEmpty';
import classes from './DocumentsPage.module.css';

const FAX_MEDIUM = 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode|FAXWRIT';

const HG_BOT_IDS = [
  'Bot/0197183c-5253-742b-88d1-91bf40d6d0d1', // receive-from-health-gorilla
  'Bot/0197183c-52d8-70ad-9326-2a17fb902151', // send-to-health-gorilla
];

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

  const isHGAuthored = HG_BOT_IDS.includes(doc.meta?.author?.reference ?? '');
  if (isHGAuthored) {
    return true;
  }

  const isAddendum = doc.type?.coding?.some((c) => c.display === 'Addendum Document');
  if (isAddendum) {
    return true;
  }

  return false;
}

export function DocumentsPage(): JSX.Element {
  const { patientId, documentId } = useParams();
  const navigate = useNavigate();
  const medplum = useMedplum();
  const patient = usePatient();
  const patientReference = useMemo(() => (patient ? getReferenceString(patient) : undefined), [patient]);

  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<PatientDocument | undefined>();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async (): Promise<void> => {
    if (!patientReference) {
      return;
    }

    try {
      const [docRefs, faxComms] = await Promise.all([
        medplum.searchResources('DocumentReference', {
          patient: patientReference,
          _sort: '-_lastUpdated',
          _count: '100',
        }, { cache: 'no-cache' }),
        medplum.searchResources('Communication', {
          subject: patientReference,
          medium: FAX_MEDIUM,
          _sort: '-sent',
          _count: '100',
        }, { cache: 'no-cache' }),
      ]);

      const allDocs: PatientDocument[] = [
        ...docRefs.filter((d) => !isHGLabArtifact(d)).map((d: DocumentReference) => toPatientDocument(d)),
        ...faxComms.map((c: Communication) => toPatientDocument(c)),
      ];

      allDocs.sort((a, b) => {
        const aTime = a.date ? new Date(a.date).getTime() : 0;
        const bTime = b.date ? new Date(b.date).getTime() : 0;
        return bTime - aTime;
      });

      setDocuments(allDocs);
    } catch (error) {
      showErrorNotification(error);
    }
  }, [medplum, patientReference]);

  useEffect(() => {
    if (patientId) {
      setLoading(true);
      fetchDocuments()
        .catch(showErrorNotification)
        .finally(() => setLoading(false));
    }
  }, [patientId, fetchDocuments]);

  useEffect(() => {
    if (documentId && documents.length > 0) {
      const doc = documents.find((d) => d.id === documentId);
      if (doc) {
        setSelectedDoc(doc);
      } else {
        setSelectedDoc(undefined);
      }
    } else if (!documentId && documents.length > 0) {
      navigate(`/Patient/${patientId}/DocumentReference/${documents[0].id}`, { replace: true })?.catch(console.error);
    } else {
      setSelectedDoc(undefined);
    }
  }, [documentId, documents, navigate, patientId]);

  const getItemUri = useCallback(
    (item: PatientDocument): string => {
      return `/Patient/${patientId}/DocumentReference/${item.id}`;
    },
    [patientId]
  );

  const handleDocumentChange = (): void => {
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
    if (sortAsc) {
      return [...documents].reverse();
    }
    return documents;
  }, [documents, sortAsc]);

  const patientRef = patient ? { reference: `Patient/${patient.id}` } as const : undefined;

  return (
    <Box w="100%" h="100%" style={{ overflow: 'hidden' }}>
      <Flex h="100%" style={{ overflow: 'hidden' }}>
        <Box w={350} h="100%">
          <Flex direction="column" h="100%" className={classes.borderRight}>
            <Paper>
              <Flex h={64} align="center" justify="space-between" p="md">
                <Text fw={450} size="sm" c="gray.7">
                  All Documents
                </Text>
                <Group gap="xs">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                    accept=".pdf,.png,.jpg,.jpeg,.tiff,.doc,.docx"
                  />
                  <Tooltip label={sortAsc ? 'Newest First' : 'Oldest First'} position="bottom" openDelay={500}>
                    <ActionIcon
                      variant="transparent"
                      size={32}
                      radius="xl"
                      onClick={() => setSortAsc(!sortAsc)}
                      className="outline-icon-button"
                    >
                      {sortAsc ? <IconSortAscending size={16} /> : <IconSortDescending size={16} />}
                    </ActionIcon>
                  </Tooltip>
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
            </Paper>

            <Divider />
            <Paper style={{ flex: 1, overflow: 'hidden' }}>
              <ScrollArea h="100%" id="document-list-scrollarea">
                <Box p={10}>
                  {loading && <DocListSkeleton />}
                  {!loading && filteredDocs.length === 0 && <EmptyDocsState />}
                  {!loading &&
                    filteredDocs.length > 0 &&
                    filteredDocs.map((item, index) => {
                      const isSelected = selectedDoc?.id === item.id;
                      const nextIsSelected = index < filteredDocs.length - 1 && selectedDoc?.id === filteredDocs[index + 1]?.id;

                      return (
                        <DocumentListItem
                          key={`${item.resourceType}-${item.id}`}
                          item={item}
                          selectedItem={selectedDoc}
                          getItemUri={getItemUri}
                          hideDivider={isSelected || nextIsSelected}
                        />
                      );
                    })}
                </Box>
              </ScrollArea>
            </Paper>
          </Flex>
        </Box>

        {selectedDoc ? (
          <DocumentDetailPanel
            key={selectedDoc.id}
            item={selectedDoc}
            patientRef={patientRef}
            onDocumentChange={handleDocumentChange}
          />
        ) : (
          <Flex direction="column" h="100%" style={{ flex: 1 }}>
            <DocumentSelectEmpty />
          </Flex>
        )}
      </Flex>
    </Box>
  );
}

function EmptyDocsState(): JSX.Element {
  return (
    <Flex direction="column" h="100%" justify="center" align="center">
      <Stack align="center" gap="md" pt="xl">
        <Text size="md" c="dimmed" fw={400}>
          No documents to display.
        </Text>
      </Stack>
    </Flex>
  );
}

function DocListSkeleton(): JSX.Element {
  return (
    <Stack gap="md" p="md">
      {Array.from({ length: 6 }).map((_, index) => (
        <Stack key={index}>
          <Flex direction="column" gap="xs" align="flex-start">
            <Skeleton height={16} width="80%" />
            <Skeleton height={14} width="50%" />
          </Flex>
          <Divider />
        </Stack>
      ))}
    </Stack>
  );
}
