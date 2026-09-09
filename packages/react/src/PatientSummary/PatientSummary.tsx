// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Divider, Flex, Group, Skeleton, Stack, Text, Tooltip } from '@mantine/core';
import { formatHumanName, resolveId } from '@medplum/core';
import type { OperationOutcome, Patient, Reference, Resource } from '@medplum/fhirtypes';
import { useMedplum, usePatientSummaryData, useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import styles from './PatientSummary.module.css';
import type { PatientSummarySectionConfig } from './PatientSummary.types';
import { getDefaultSections } from './sectionConfigs';
import SummaryItem from './SummaryItem';

export interface PatientSummaryProps {
  readonly patient: Patient | Reference<Patient>;
  readonly onClickResource?: (resource: Resource) => void;
  readonly onRequestLabs?: () => void;
  readonly sections?: PatientSummarySectionConfig[];
}

export function PatientSummary(props: PatientSummaryProps): JSX.Element | null {
  const medplum = useMedplum();
  const { patient: propsPatient, onClickResource, onRequestLabs } = props;
  const [patientOutcome, setPatientOutcome] = useState<OperationOutcome | undefined>();
  const patient = useResource(propsPatient, setPatientOutcome);
  const [createdDate, setCreatedDate] = useState<string | undefined>();

  // Determine sections: custom or default
  const defaultSections = useMemo(() => getDefaultSections(onRequestLabs), [onRequestLabs]);
  const sections = props.sections ?? defaultSections;

  // Fetch all data for all sections (with search deduplication)
  const { sectionData, loading, error } = usePatientSummaryData(propsPatient, sections);

  useEffect(() => {
    const id = resolveId(propsPatient);
    if (id) {
      medplum
        .readHistory('Patient', id)
        .then((history) => {
          const firstEntry = history.entry?.[history.entry.length - 1];
          const lastUpdated = firstEntry?.resource?.meta?.lastUpdated;
          setCreatedDate(typeof lastUpdated === 'string' ? lastUpdated : '');
        })
        .catch(() => {});
    }
  }, [propsPatient, medplum]);

  if (!patient) {
    return patientOutcome ? null : <PatientSummarySkeleton sections={Math.max(sections.length - 1, 1)} />;
  }

  return (
    <Flex direction="column" gap="xs" w="100%" h="100%" className={styles.panel}>
      <SummaryItem
        onClick={() => {
          onClickResource?.(patient);
        }}
      >
        <Group align="center" gap="sm" p={16}>
          <ResourceAvatar value={patient} size={48} radius={48} style={{ border: '2px solid white' }} />
          <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
            <Tooltip label={formatHumanName(patient.name?.[0])} position="top-start" openDelay={650}>
              <Text fz="h4" fw={800} truncate style={{ minWidth: 0 }}>
                {formatHumanName(patient.name?.[0])}
              </Text>
            </Tooltip>
            {(() => {
              const dateString = typeof createdDate === 'string' && createdDate.length > 0 ? createdDate : undefined;
              if (!dateString) {
                return null;
              }
              const d = new Date(dateString);
              return (
                <Text fz="xs" mt={-2} fw={500} c="gray.6" truncate style={{ minWidth: 0 }}>
                  Patient since {d.getMonth() + 1}/{d.getDate()}/{d.getFullYear()}
                </Text>
              );
            })()}
          </Stack>
        </Group>
        <Divider />
      </SummaryItem>

      <Stack gap="xs" px={16} pt={12} pb={16} style={{ flex: 2, overflowY: 'auto', minHeight: 0 }}>
        {error && (
          <Text c="red" fz="sm">
            Error loading patient summary: {error.message}
          </Text>
        )}
        {loading && sections.length > 0 && (
          <PatientSummarySectionsSkeleton sections={Math.max(sections.length - 1, 1)} />
        )}
        {!loading && sections.length > 0 && (
          <>
            {sections.map((section, index) => {
              const SectionComponent = section.component;
              return (
                <div key={section.key}>
                  <SectionComponent
                    patient={patient}
                    onClickResource={onClickResource}
                    results={sectionData[index] ?? {}}
                  />
                  <Divider />
                </div>
              );
            })}
          </>
        )}
      </Stack>
    </Flex>
  );
}

export interface PatientSummarySkeletonProps {
  readonly sections?: number;
}

/**
 * Loading placeholder that mirrors the PatientSummary layout: the patient header followed by
 * demographic rows and a set of collapsible sections with their items.
 * @param props - The skeleton props.
 * @returns The PatientSummarySkeleton React node.
 */
export function PatientSummarySkeleton(props: PatientSummarySkeletonProps): JSX.Element {
  return (
    <Flex direction="column" gap="xs" w="100%" h="100%" className={styles.panel} data-testid="patient-summary-skeleton">
      <Group align="center" gap="sm" p={16} wrap="nowrap">
        <Skeleton circle height={48} style={{ flexShrink: 0 }} />
        <Stack gap={8} style={{ flex: 1, minWidth: 0 }}>
          <Skeleton height={20} width="60%" />
          <Skeleton height={10} width="45%" />
        </Stack>
      </Group>
      <Divider />
      <Stack gap="xs" px={16} pt={12} pb={16} style={{ flex: 2, overflow: 'hidden', minHeight: 0 }}>
        <PatientSummarySectionsSkeleton sections={props.sections} />
      </Stack>
    </Flex>
  );
}

const SKELETON_ROW_WIDTHS = ['55%', '30%', '40%', '75%', '25%', '50%'];

/**
 * Loading placeholder for the scrollable body of the PatientSummary: a block of demographic rows
 * followed by collapsible section headers, each with a few item rows and a status badge.
 * @param props - The skeleton props.
 * @returns The PatientSummarySectionsSkeleton React node.
 */
function PatientSummarySectionsSkeleton(props: PatientSummarySkeletonProps): JSX.Element {
  const sections = props.sections ?? 3;
  return (
    <div data-testid="patient-summary-sections-skeleton">
      <Stack gap="xs" py={8}>
        {SKELETON_ROW_WIDTHS.map((width, index) => (
          <Group key={index} gap="sm" align="center" ml={6} py={2} wrap="nowrap">
            <Skeleton circle height={16} style={{ flexShrink: 0 }} />
            <Skeleton height={14} width={width} />
          </Group>
        ))}
      </Stack>
      <Divider />
      {Array.from({ length: sections }, (_, index) => (
        <Box key={index}>
          <Box py="xs">
            <Group gap={8} align="center" wrap="nowrap">
              <Skeleton circle height={28} style={{ flexShrink: 0 }} />
              <Skeleton height={16} width={SKELETON_ROW_WIDTHS[(index + 1) % SKELETON_ROW_WIDTHS.length]} />
            </Group>
            <Stack gap="sm" ml="var(--mantine-spacing-xl)" mt="xs" mb="md" pl={4}>
              {Array.from({ length: 2 }, (_, item) => (
                <Stack key={item} gap={6}>
                  <Skeleton height={14} width={SKELETON_ROW_WIDTHS[(index + item) % SKELETON_ROW_WIDTHS.length]} />
                  <Skeleton height={18} width={64} radius="xl" />
                </Stack>
              ))}
            </Stack>
          </Box>
          <Divider />
        </Box>
      ))}
    </div>
  );
}
