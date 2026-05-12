import {
  Box,
  Divider,
  Flex,
  Group,
  Menu,
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
import { IconFilter, IconSortDescending, IconSortAscending } from '@tabler/icons-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import { usePatient } from '../../hooks/usePatient';
import { showErrorNotification } from '../../utils/notifications';
import { DocumentListItem, toPatientDocument } from '../../components/documents/DocumentListItem';
import type { PatientDocument } from '../../components/documents/DocumentListItem';
import { DocumentDetailPanel } from '../../components/documents/DocumentDetailPanel';
import { DocumentSelectEmpty } from '../../components/documents/DocumentSelectEmpty';
import classes from './DocumentsPage.module.css';

const FAX_MEDIUM = 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode|FAXWRIT';

type DocTypeFilter = 'all' | 'document' | 'fax' | 'lab';

export function DocumentsPage(): JSX.Element {
  const { patientId, documentId } = useParams();
  const navigate = useNavigate();
  const medplum = useMedplum();
  const patient = usePatient();
  const patientReference = useMemo(() => (patient ? getReferenceString(patient) : undefined), [patient]);

  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<PatientDocument | undefined>();
  const [loading, setLoading] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [typeFilter, setTypeFilter] = useState<DocTypeFilter>('all');

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
        ...docRefs.map((d: DocumentReference) => toPatientDocument(d)),
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
    } else {
      setSelectedDoc(undefined);
    }
  }, [documentId, documents]);

  const getItemUri = useCallback(
    (item: PatientDocument): string => {
      return `/Patient/${patientId}/DocumentReference/${item.id}`;
    },
    [patientId]
  );

  const handleDocumentChange = (): void => {
    fetchDocuments().catch(showErrorNotification);
  };

  const filteredDocs = useMemo(() => {
    let result = documents;

    if (typeFilter === 'fax') {
      result = result.filter((d) => d.resourceType === 'Communication');
    } else if (typeFilter === 'document') {
      result = result.filter((d) => d.resourceType === 'DocumentReference' && d.tag !== 'Lab');
    } else if (typeFilter === 'lab') {
      result = result.filter((d) => d.tag === 'Lab');
    }

    if (sortAsc) {
      result = [...result].reverse();
    }

    return result;
  }, [documents, typeFilter, sortAsc]);

  const patientRef = patient ? { reference: `Patient/${patient.id}` } as const : undefined;

  return (
    <Box w="100%" h="100%">
      <Flex h="100%">
        <Box w={350} h="100%">
          <Flex direction="column" h="100%" className={classes.borderRight}>
            <Paper>
              <Flex h={64} align="center" justify="space-between" p="md">
                <Text fw={600} size="md">
                  Documents
                </Text>
                <Group gap="xs">
                  <Menu shadow="md" width={160} position="bottom-start" radius="md">
                    <Menu.Target>
                      <Tooltip label="Filter by type" position="bottom" openDelay={500}>
                        <ActionIcon variant="transparent" size={32} radius="xl" className="outline-icon-button">
                          <IconFilter size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Label>Document Type</Menu.Label>
                      <Menu.Item onClick={() => setTypeFilter('all')}>All</Menu.Item>
                      <Menu.Item onClick={() => setTypeFilter('document')}>Documents</Menu.Item>
                      <Menu.Item onClick={() => setTypeFilter('fax')}>Faxes</Menu.Item>
                      <Menu.Item onClick={() => setTypeFilter('lab')}>Lab Results</Menu.Item>
                    </Menu.Dropdown>
                  </Menu>

                  <Tooltip label={sortAsc ? 'Oldest first' : 'Newest first'} position="bottom" openDelay={500}>
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
                </Group>
              </Flex>
            </Paper>

            <Divider />
            <Paper style={{ flex: 1, overflow: 'hidden' }}>
              <ScrollArea h="100%" id="document-list-scrollarea" p="0.5rem">
                {loading && <DocListSkeleton />}
                {!loading && filteredDocs.length === 0 && <EmptyDocsState />}
                {!loading &&
                  filteredDocs.length > 0 &&
                  filteredDocs.map((item, index) => (
                    <React.Fragment key={`${item.resourceType}-${item.id}`}>
                      <DocumentListItem
                        item={item}
                        selectedItem={selectedDoc}
                        getItemUri={getItemUri}
                      />
                      {index < filteredDocs.length - 1 && (
                        <Box px="0.5rem">
                          <Divider />
                        </Box>
                      )}
                    </React.Fragment>
                  ))}
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
