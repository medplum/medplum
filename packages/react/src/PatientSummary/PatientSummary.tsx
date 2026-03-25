// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Flex, Group, Stack, Text, Tooltip } from '@mantine/core';
import { calculateAgeString, formatAddress, formatHumanName, resolveId } from '@medplum/core';
import type {
  AllergyIntolerance,
  Appointment,
  Condition,
  Coverage,
  Device,
  DiagnosticReport,
  Encounter,
  Goal,
  HumanName,
  Immunization,
  MedicationRequest,
  Observation,
  Patient,
  Procedure,
  Reference,
  Resource,
  ServiceRequest,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import {
  IconBinaryTree,
  IconCake,
  IconEmpathize,
  IconLanguage,
  IconMapPin,
  IconStethoscope,
} from '@tabler/icons-react';
import type { ComponentType, JSX } from 'react';
import { useEffect, useState } from 'react';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import { Allergies } from './Allergies';
import { Insurance } from './Insurance';
import { Labs } from './Labs';
import { Medications } from './Medications';
import { PatientInfoItem } from './PatientInfoItem';
import styles from './PatientSummary.module.css';
import {
  formatPatientGenderDisplay,
  formatPatientRaceEthnicityDisplay,
  getEthnicity,
  getGeneralPractitioner,
  getPreferredLanguage,
  getRace,
} from './PatientSummary.utils';
import type { PharmacyDialogBaseProps } from './Pharmacies';
import { Pharmacies } from './Pharmacies';
import { ProblemList } from './ProblemList';
import { SexualOrientation } from './SexualOrientation';
import { SmokingStatus } from './SmokingStatus';
import SummaryItem from './SummaryItem';
import { Vitals } from './Vitals';

export type PatientSummarySection =
  | 'allergies'
  | 'problemList'
  | 'medications'
  | 'labs'
  | 'sexualOrientation'
  | 'smokingStatus'
  | 'vitals'
  | 'insurance'
  | 'pharmacies'
  | 'birthdate'
  | 'gender'
  | 'raceEthnicity'
  | 'location'
  | 'language'
  | 'generalPractitioner';

export interface PatientSummaryProps {
  readonly patient: Patient | Reference<Patient>;
  readonly onClickResource?: (resource: Resource) => void;
  readonly onRequestLabs?: () => void;
  readonly pharmacyDialogComponent?: ComponentType<PharmacyDialogBaseProps>;
  readonly hideSections?: PatientSummarySection[];
}

interface PatientMedicalData {
  readonly allergies: AllergyIntolerance[];
  readonly problems: Condition[];
  readonly sexualOrientation?: Observation;
  readonly smokingStatus?: Observation;
  readonly vitals: Observation[];
  readonly medicationRequests: MedicationRequest[];
  readonly encounters?: Encounter[];
  readonly appointments?: Appointment[];
  readonly coverages?: Coverage[];
  readonly immunizations?: Immunization[];
  readonly procedures?: Procedure[];
  readonly devices?: Device[];
  readonly goals?: Goal[];
  readonly serviceRequests: ServiceRequest[];
  readonly diagnosticReports: DiagnosticReport[];
}

export function PatientSummary(props: PatientSummaryProps): JSX.Element | null {
  const medplum = useMedplum();
  const { patient: propsPatient, onClickResource, onRequestLabs, pharmacyDialogComponent, hideSections } = props;
  const patient = useResource(propsPatient);
  const [medicalData, setMedicalData] = useState<PatientMedicalData>();
  const [createdDate, setCreatedDate] = useState<string | undefined>();

  useEffect(() => {
    const hidden = new Set(hideSections ?? []);
    const id = resolveId(propsPatient) as string;
    const ref = `Patient/${id}`;
    const searchMeta = { _count: 100, _sort: '-_lastUpdated' };
    const empty = Promise.resolve([]) as Promise<never[]>;

    const skipObservations = hidden.has('sexualOrientation') && hidden.has('smokingStatus') && hidden.has('vitals');

    Promise.all([
      hidden.has('allergies') ? empty : medplum.searchResources('AllergyIntolerance', { patient: ref, ...searchMeta }),
      hidden.has('problemList') ? empty : medplum.searchResources('Condition', { patient: ref, ...searchMeta }),
      hidden.has('medications') ? empty : medplum.searchResources('MedicationRequest', { subject: ref, ...searchMeta }),
      skipObservations ? empty : medplum.searchResources('Observation', { subject: ref, ...searchMeta }),
      medplum.searchResources('Appointment', { patient: ref, ...searchMeta }),
      medplum.searchResources('Encounter', { subject: ref, ...searchMeta }),
      hidden.has('insurance') ? empty : medplum.searchResources('Coverage', { beneficiary: ref, ...searchMeta }),
      medplum.searchResources('Immunization', { patient: ref, ...searchMeta }),
      medplum.searchResources('Procedure', { subject: ref, ...searchMeta }),
      medplum.searchResources('Device', { patient: ref, ...searchMeta }),
      medplum.searchResources('Goal', { subject: ref, ...searchMeta }),
      hidden.has('labs') ? empty : medplum.searchResources('ServiceRequest', { subject: ref, ...searchMeta }),
      hidden.has('labs') ? empty : medplum.searchResources('DiagnosticReport', { subject: ref, ...searchMeta }),
    ])
      .then((results) => {
        const observations = results[3];
        setMedicalData({
          allergies: results[0],
          problems: results[1],
          medicationRequests: results[2],
          sexualOrientation: observations.find((obs) => obs.code?.coding?.[0].code === '76690-7'),
          smokingStatus: observations.find((obs) => obs.code?.coding?.[0].code === '72166-2'),
          vitals: observations.filter((obs) => obs.category?.[0]?.coding?.[0].code === 'vital-signs'),
          appointments: results[4],
          encounters: results[5],
          coverages: results[6],
          immunizations: results[7],
          procedures: results[8],
          devices: results[9],
          goals: results[10],
          serviceRequests: results[11],
          diagnosticReports: results[12],
        });
      })
      .catch(console.error);
  }, [medplum, propsPatient, hideSections]);

  useEffect(() => {
    if (patient?.id) {
      medplum
        .readHistory('Patient', patient.id)
        .then((history) => {
          const firstEntry = history.entry?.[history.entry.length - 1];
          const lastUpdated = firstEntry?.resource?.meta?.lastUpdated;
          setCreatedDate(typeof lastUpdated === 'string' ? lastUpdated : '');
        })
        .catch(() => {});
    }
  }, [patient?.id, medplum]);

  const hidden = new Set(hideSections ?? []);
  const languageDisplay = patient ? getPreferredLanguage(patient) : undefined;

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
        {medicalData && (
          <>
            <Stack gap="xs" py={8}>
              {!hidden.has('birthdate') && (
                <PatientInfoItem
                  patient={patient}
                  value={
                    patient.birthDate ? `${patient.birthDate} (${calculateAgeString(patient.birthDate)})` : undefined
                  }
                  icon={<IconCake size={16} stroke={2} color="var(--mantine-color-gray-6)" />}
                  placeholder="Add Birthdate"
                  label="Birthdate & Age"
                  onClickResource={onClickResource}
                />
              )}
              {!hidden.has('gender') && (
                <PatientInfoItem
                  patient={patient}
                  value={patient.gender ? formatPatientGenderDisplay(patient) : undefined}
                  icon={<IconEmpathize size={16} stroke={2} color="var(--mantine-color-gray-6)" />}
                  placeholder="Add Gender & Identity"
                  label="Gender & Identity"
                  onClickResource={onClickResource}
                />
              )}
              {!hidden.has('raceEthnicity') && (
                <PatientInfoItem
                  patient={patient}
                  value={
                    getRace(patient) || getEthnicity(patient) ? formatPatientRaceEthnicityDisplay(patient) : undefined
                  }
                  icon={<IconBinaryTree size={16} stroke={2} color="var(--mantine-color-gray-6)" />}
                  placeholder="Add Race & Ethnicity"
                  label="Race & Ethnicity"
                  onClickResource={onClickResource}
                />
              )}
              {!hidden.has('location') && (
                <PatientInfoItem
                  patient={patient}
                  value={patient.address?.[0] ? formatAddress(patient.address[0]) : undefined}
                  icon={<IconMapPin size={16} stroke={2} color="var(--mantine-color-gray-6)" />}
                  placeholder="Add Location"
                  label="Location"
                  onClickResource={onClickResource}
                />
              )}
              {!hidden.has('language') && (
                <PatientInfoItem
                  patient={patient}
                  value={languageDisplay}
                  icon={<IconLanguage size={16} stroke={2} color="var(--mantine-color-gray-6)" />}
                  placeholder="Add Language"
                  label="Language"
                  onClickResource={onClickResource}
                />
              )}
              {!hidden.has('generalPractitioner') && (
                <PatientInfoItem
                  patient={patient}
                  value={getGeneralPractitioner(patient)}
                  icon={<IconStethoscope size={16} stroke={2} color="var(--mantine-color-gray-6)" />}
                  placeholder="Add General Practitioner"
                  label="General Practitioner"
                  onClickResource={onClickResource}
                />
              )}
            </Stack>
            <Divider />
            {!hidden.has('insurance') && (
              <>
                <Insurance coverages={medicalData.coverages || []} onClickResource={onClickResource} />
                <Divider />
              </>
            )}
            {!hidden.has('allergies') && (
              <>
                <Allergies patient={patient} allergies={medicalData.allergies} onClickResource={onClickResource} />
                <Divider />
              </>
            )}
            {!hidden.has('problemList') && (
              <>
                <ProblemList patient={patient} problems={medicalData.problems} onClickResource={onClickResource} />
                <Divider />
              </>
            )}
            {!hidden.has('medications') && (
              <>
                <Medications
                  patient={patient}
                  medicationRequests={medicalData.medicationRequests}
                  onClickResource={onClickResource}
                />
                <Divider />
              </>
            )}
            {!hidden.has('labs') && (
              <>
                <Labs
                  patient={patient}
                  serviceRequests={medicalData.serviceRequests}
                  diagnosticReports={medicalData.diagnosticReports}
                  onClickResource={onClickResource}
                  onRequestLabs={onRequestLabs}
                />
                <Divider />
              </>
            )}
            {!hidden.has('sexualOrientation') && (
              <>
                <SexualOrientation
                  patient={patient}
                  sexualOrientation={medicalData.sexualOrientation}
                  onClickResource={onClickResource}
                />
                <Divider />
              </>
            )}
            {!hidden.has('smokingStatus') && (
              <>
                <SmokingStatus
                  patient={patient}
                  smokingStatus={medicalData.smokingStatus}
                  onClickResource={onClickResource}
                />
                <Divider />
              </>
            )}
            {!hidden.has('vitals') && (
              <>
                <Vitals patient={patient} vitals={medicalData.vitals} onClickResource={onClickResource} />
                <Divider />
              </>
            )}
            {!hidden.has('pharmacies') && (
              <>
                <Pharmacies
                  patient={patient}
                  onClickResource={onClickResource}
                  pharmacyDialogComponent={pharmacyDialogComponent}
                />
                <Divider />
              </>
            )}
          </>
        )}
      </Stack>
    </Flex>
  );
}
