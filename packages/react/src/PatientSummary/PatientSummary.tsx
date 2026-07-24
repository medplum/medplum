// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Box, Divider, Flex, Group, Menu, Stack, Text, Tooltip } from '@mantine/core';
import { formatHumanName, resolveId } from '@medplum/core';
import type { Patient, Reference, Resource } from '@medplum/fhirtypes';
import { useMedplum, usePatientSummaryData, useResource } from '@medplum/react-hooks';
import { IconDots } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import styles from './PatientSummary.module.css';
import type { PatientSummarySectionConfig } from './PatientSummary.types';
import { isEnteredInError } from './PatientSummary.utils';
import { getDefaultSections } from './sectionConfigs';

/**
 * Drops `entered-in-error` resources from a section's search results so they don't appear in the
 * summary. The underlying resources are untouched and remain accessible by direct URL.
 * @param results - The section's search results, keyed by search key.
 * @returns The results with entered-in-error resources removed.
 */
function filterEnteredInError(results: Record<string, Resource[]>): Record<string, Resource[]> {
  const filtered: Record<string, Resource[]> = {};
  for (const [key, resources] of Object.entries(results)) {
    filtered[key] = Array.isArray(resources) ? resources.filter((resource) => !isEnteredInError(resource)) : resources;
  }
  return filtered;
}

export interface PatientSummaryProps {
  readonly patient: Patient | Reference<Patient>;
  readonly onClickResource?: (resource: Resource) => void;
  readonly onRequestLabs?: () => void;
  readonly sections?: PatientSummarySectionConfig[];
  /**
   * Optional `<Menu.Item>` nodes rendered inside a "…" actions menu in the header.
   * When provided, a hover-revealed menu button appears in the header's top-right.
   */
  readonly headerMenuItems?: ReactNode;
  /**
   * When true (default), the header links to the patient profile root (`/Patient/:id`).
   * Set false when the summary is already shown on that patient's profile page.
   */
  readonly linkToPatient?: boolean;
  /**
   * When provided, clicking a Demographics row opens this callback (the patient edit modal)
   * instead of navigating via `onClickResource`.
   */
  readonly onEditPatient?: () => void;
}

export function PatientSummary(props: PatientSummaryProps): JSX.Element | null {
  const medplum = useMedplum();
  const {
    patient: propsPatient,
    onClickResource,
    onRequestLabs,
    headerMenuItems,
    linkToPatient = true,
    onEditPatient,
  } = props;
  const patient = useResource(propsPatient);
  const [createdDate, setCreatedDate] = useState<string | undefined>();
  const nameRef = useRef<HTMLParagraphElement>(null);
  const [isNameTruncated, setIsNameTruncated] = useState(false);

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

  useEffect(() => {
    const checkTruncation = (): void => {
      const el = nameRef.current;
      setIsNameTruncated(!!el && el.scrollWidth > el.clientWidth);
    };
    checkTruncation();
    window.addEventListener('resize', checkTruncation);
    return () => window.removeEventListener('resize', checkTruncation);
  }, [patient]);

  if (!patient) {
    return null;
  }

  const headerContent = (
    <Group align="center" gap="sm" py="md" pl="sm" pr="xl">
      <ResourceAvatar value={patient} size={48} radius={48} className={styles.avatar} />
      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
        <Tooltip
          label={formatHumanName(patient.name?.[0])}
          position="top-start"
          openDelay={650}
          disabled={!isNameTruncated}
        >
          <Text ref={nameRef} fz="h4" fw={800} truncate style={{ minWidth: 0 }}>
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
  );

  return (
    <Flex direction="column" gap={0} w="100%" h="100%" className={styles.panel}>
      <Box>
        <Box className={styles.headerRow}>
          {linkToPatient ? (
            <MedplumLink to={patient} className={styles.headerLink} underline="never">
              {headerContent}
            </MedplumLink>
          ) : (
            headerContent
          )}
          {headerMenuItems && (
            <>
              <div className={styles.gradient} aria-hidden="true" />
              <div className={styles.headerMenu}>
                <Menu shadow="md" radius="md" width={240} position="bottom-end">
                  <Menu.Target>
                    <ActionIcon variant="subtle" size="md" radius="xl" aria-label="Patient actions">
                      <IconDots size={18} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>{headerMenuItems}</Menu.Dropdown>
                </Menu>
              </div>
            </>
          )}
        </Box>
        <Divider />
      </Box>

      <Stack gap={0} px="xs" pb={16} style={{ flex: 2, overflowY: 'auto', minHeight: 0 }}>
        {error && (
          <Text c="red" fz="sm">
            Error loading patient summary: {error.message}
          </Text>
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
                    onEditPatient={onEditPatient}
                    results={filterEnteredInError(sectionData[index] ?? {})}
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
