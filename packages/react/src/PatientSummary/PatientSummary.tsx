// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Flex, Group, Stack, Text, Tooltip } from '@mantine/core';
import { formatHumanName, resolveId } from '@medplum/core';
import type { HumanName, Patient, Reference, Resource } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import type { ComponentType, JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import styles from './PatientSummary.module.css';
import type { PatientSummarySectionConfig } from './PatientSummary.types';
import type { PharmacyDialogBaseProps } from './Pharmacies';
import { getDefaultSections } from './sectionConfigs';
import SummaryItem from './SummaryItem';
import { usePatientSummaryData } from './usePatientSummaryData';

export interface PatientSummaryProps {
  readonly patient: Patient | Reference<Patient>;
  readonly onClickResource?: (resource: Resource) => void;
  readonly onRequestLabs?: () => void;
  readonly pharmacyDialogComponent?: ComponentType<PharmacyDialogBaseProps>;
  readonly sections?: PatientSummarySectionConfig[];
}

export function PatientSummary(props: PatientSummaryProps): JSX.Element | null {
  const medplum = useMedplum();
  const { patient: propsPatient, onClickResource, onRequestLabs, pharmacyDialogComponent } = props;
  const patient = useResource(propsPatient);
  const [createdDate, setCreatedDate] = useState<string | undefined>();

  // Determine sections: custom or default
  const defaultSections = useMemo(
    () => getDefaultSections(onRequestLabs, pharmacyDialogComponent),
    [onRequestLabs, pharmacyDialogComponent]
  );
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
    return null;
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
            <Tooltip label={formatHumanName(patient.name?.[0] as HumanName)} position="top-start" openDelay={650}>
              <Text fz="h4" fw={800} truncate style={{ minWidth: 0 }}>
                {formatHumanName(patient.name?.[0] as HumanName)}
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
            Error loading patient summary
          </Text>
        )}
        {!loading && !error && sections.length > 0 && (
          <>
            {sections.map((section, index) => (
              <div key={section.key}>
                {section.render({
                  patient,
                  onClickResource,
                  results: sectionData[index] ?? [],
                })}
                <Divider />
              </div>
            ))}
          </>
        )}
      </Stack>
    </Flex>
  );
}
