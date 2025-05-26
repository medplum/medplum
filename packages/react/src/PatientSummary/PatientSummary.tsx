import { Box, Divider, Flex, Group, Stack, Text, Tooltip } from '@mantine/core';
import { formatHumanName, resolveId } from '@medplum/core';
import {
  AllergyIntolerance,
  Appointment,
  Condition,
  Coverage,
  Device,
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
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import {
  IconBinaryTree,
  IconCake,
  IconEmpathize,
  IconMapPin,
  IconStethoscope,
} from '@tabler/icons-react';
import { JSX, useEffect, useRef, useState } from 'react';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import { Allergies } from './Allergies';
import { Insurance } from './Insurance';
import { Medications } from './Medications';
import styles from './PatientSummary.module.css';
import { ProblemList } from './ProblemList';
import { SexualOrientation } from './SexualOrientation';
import { SmokingStatus } from './SmokingStatus';
import SummaryItem from './SummaryItem';
import { Vitals } from './Vitals';
import { getBirthSex, getEthnicity, getGenderIdentity, getGeneralPractitioner, getPatientAgeDisplay, getRace } from './PatientSummary.utils';

export interface PatientSummaryProps {
  readonly patient: Patient | Reference<Patient>;
  readonly background?: string;
  /** The URL that the upcoming appointments link should navigate to or `undefined` to not show the link. */
  readonly appointmentsUrl?: string;
  /** The URL that the documented visits (encounters) link should navigate to or `undefined` to not show the link. */
  readonly encountersUrl?: string;
  /** Callback when a resource is clicked in the list */
  readonly onClickResource?: (resource: Resource) => void;
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
  readonly socialHistory: Observation[];
  readonly goals?: Goal[];
}

export function PatientSummary(props: PatientSummaryProps): JSX.Element | null {
  const medplum = useMedplum();
  const { patient: propsPatient, onClickResource } = props;
  const patient = useResource(propsPatient);
  const [medicalData, setMedicalData] = useState<PatientMedicalData>();
  const [createdDate, setCreatedDate] = useState<string | undefined>();
  const nameRef = useRef<HTMLDivElement>(null);
  const [isNameOverflowed, setIsNameOverflowed] = useState(false);

  useEffect(() => {
    const id = resolveId(propsPatient) as string;
    const ref = `Patient/${id}`;
    const searchMeta = { _count: 100, _sort: '-_lastUpdated' };

    Promise.all([
      medplum.searchResources('AllergyIntolerance', { patient: ref, ...searchMeta }),
      medplum.searchResources('Condition', { patient: ref, ...searchMeta }),
      medplum.searchResources('MedicationRequest', { subject: ref, ...searchMeta }),
      medplum.searchResources('Observation', { subject: ref, ...searchMeta }),
      medplum.searchResources('Appointment', {
        patient: ref,
        ...searchMeta,
      }),
      medplum.searchResources('Encounter', {
        subject: ref,
        ...searchMeta,
      }),
      medplum.searchResources('Coverage', {
        beneficiary: ref,
        ...searchMeta,
      }),
      medplum.searchResources('Immunization', {
        patient: ref,
        ...searchMeta,
      }),
      medplum.searchResources('Procedure', {
        subject: ref,
        ...searchMeta,
      }),
      medplum.searchResources('Device', {
        patient: ref,
        ...searchMeta,
      }),
      medplum.searchResources('Goal', {
        subject: ref,
        ...searchMeta,
      }),
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
          socialHistory: observations.filter((obs) =>
            obs.category?.some((cat) => cat.coding?.some((coding) => coding.code === 'social-history'))
          ),
        });
      })
      .catch(console.error);
  }, [medplum, propsPatient]);

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

  useEffect(() => {
    const el = nameRef.current;
    if (el) {
      setIsNameOverflowed(el.scrollWidth > el.clientWidth);
    }
  }, [patient]);

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
            <Tooltip
              label={formatHumanName(patient.name?.[0] as HumanName)}
              position="top-start"
              openDelay={650}
              disabled={!isNameOverflowed}
            >
              <Text fz="h4" fw={800} truncate style={{ minWidth: 0 }} ref={nameRef}>
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
      </SummaryItem>
      <Divider />
      <Stack gap="xs" px={16} pt={12} pb={16} style={{ flex: 2, overflowY: 'auto', minHeight: 0 }}>
        {medicalData && (
          <>
            <Stack gap="xs" py={8}>
              <SummaryItem
                onClick={() => {
                  onClickResource?.(patient);
                }}
              >
                <Box className={styles.patientSummaryListItem}>
                  <Tooltip label="Birthdate & Age" position="top-start" openDelay={650}>
                    <Group gap="sm" align="center" ml={6} mr={2} style={{ cursor: 'pointer', flexWrap: 'nowrap', minWidth: 0 }}>
                      <IconCake
                        size={16}
                        stroke={2}
                        color="var(--mantine-color-gray-6)"
                      />
                      <Text
                        fz="sm"
                        fw={400}
                        truncate
                        c={patient.birthDate ? 'inherit' : 'var(--mantine-color-gray-6)'}
                      >
                        {patient.birthDate
                          ? getPatientAgeDisplay(patient.birthDate)
                          : 'Add Birthdate'}
                      </Text>
                    </Group>
                  </Tooltip>
                </Box>
              </SummaryItem>

              <SummaryItem
                onClick={() => {
                  onClickResource?.(patient);
                }}
              >
                <Box className={styles.patientSummaryListItem}>
                  <Tooltip label="Gender & Identity" position="top-start" openDelay={650}>
                    <Group gap="sm" align="center" ml={6} mr={2} style={{ cursor: 'pointer', flexWrap: 'nowrap', minWidth: 0 }}>
                      <IconEmpathize
                        size={16}
                        stroke={2}
                        color="var(--mantine-color-gray-6)"
                      />
                      <Text
                        fz="sm"
                        fw={400}
                        truncate
                        c={patient.gender || getGenderIdentity(patient) ? 'inherit' : 'var(--mantine-color-gray-6)'}
                      >
                        {patient.gender || getGenderIdentity(patient)
                          ? `${patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : ''}${patient.gender && getGenderIdentity(patient) ? ' · ' : ''}${getGenderIdentity(patient) ? `${getGenderIdentity(patient)}` : ''}${getBirthSex(patient) ? ` · Born as ${getBirthSex(patient)}` : ''}`
                          : 'Add Gender & Identity'}
                      </Text>
                    </Group>
                  </Tooltip>
                </Box>
              </SummaryItem>

              <SummaryItem
                onClick={() => {
                  onClickResource?.(patient);
                }}
              >
                <Box className={styles.patientSummaryListItem}>
                  <Tooltip label="Race & Ethnicity" position="top-start" openDelay={650}>
                    <Group gap="sm" align="center" ml={6} mr={2} style={{ cursor: 'pointer', flexWrap: 'nowrap', minWidth: 0 }}>
                      <IconBinaryTree
                        size={16}
                        stroke={2}
                        color="var(--mantine-color-gray-6)"
                      />
                      <Text
                        fz="sm"
                        fw={400}
                        truncate
                        c={getRace(patient) || getEthnicity(patient) ? 'inherit' : 'var(--mantine-color-gray-6)'}
                      >
                        {getRace(patient) || getEthnicity(patient)
                          ? `${getRace(patient) || ''}${getRace(patient) && getEthnicity(patient) ? ' · ' : ''}${getEthnicity(patient) || ''}`
                          : 'Add Race & Ethnicity'}
                      </Text>
                    </Group>
                  </Tooltip>
                </Box>
              </SummaryItem>

              <SummaryItem
                onClick={() => {
                  onClickResource?.(patient);
                }}
              >
                <Box className={styles.patientSummaryListItem}>
                  <Tooltip label="Location" position="top-start" openDelay={650}>
                    <Group gap="sm" align="center" ml={6} mr={2} style={{ cursor: 'pointer', flexWrap: 'nowrap', minWidth: 0 }}>
                      <IconMapPin
                        size={16}
                        stroke={2}
                        color="var(--mantine-color-gray-6)"
                      />
                      <Text
                        fz="sm"
                        fw={400}
                        truncate
                        c={patient.address?.[0]?.city || patient.address?.[0]?.state ? 'inherit' : 'var(--mantine-color-gray-6)'}
                      >
                        {patient.address?.[0]?.city || patient.address?.[0]?.state
                          ? `${patient.address[0].city || ''}${patient.address[0].city && patient.address[0].state ? ', ' : ''}${patient.address[0].state || ''}`
                          : 'Add Location'}
                      </Text>
                    </Group>
                  </Tooltip>
                </Box>
              </SummaryItem>

              <SummaryItem
                onClick={() => {
                  onClickResource?.(patient);
                }}
              >
                <Box className={styles.patientSummaryListItem}>
                  <Tooltip label="General Practitioner" position="top-start" openDelay={650}>
                    <Group gap="sm" align="center" style={{ cursor: 'pointer', flexWrap: 'nowrap', minWidth: 0 }}>
                      <IconStethoscope
                        size={16}
                        style={{ marginLeft: '6', marginRight: '2' }}
                        stroke={2}
                        color="var(--mantine-color-gray-6)"
                      />
                      <Text
                        fz="sm"
                        fw={400}
                        truncate
                        style={{
                          flex: 1,
                          minWidth: 0,
                          color: getGeneralPractitioner(patient) ? 'inherit' : 'var(--mantine-color-gray-6)',
                        }}  
                      >
                        {getGeneralPractitioner(patient) || 'Add a General Practitioner'}
                      </Text>
                    </Group>
                  </Tooltip>
                </Box>
              </SummaryItem>
            </Stack>
            <Divider />
            <Insurance coverages={medicalData.coverages || []} onClickResource={onClickResource} />
            <Divider />
            <Allergies patient={patient} allergies={medicalData.allergies} onClickResource={onClickResource} />
            <Divider />
            <ProblemList patient={patient} problems={medicalData.problems} onClickResource={onClickResource} />
            <Divider />
            <Medications
              patient={patient}
              medicationRequests={medicalData.medicationRequests}
              onClickResource={onClickResource}
            />
            <Divider />
            <SexualOrientation
              patient={patient}
              sexualOrientation={medicalData.sexualOrientation}
              onClickResource={onClickResource}
            />
            <Divider />
            <SmokingStatus
              patient={patient}
              smokingStatus={medicalData.smokingStatus}
              onClickResource={onClickResource}
            />
            <Divider />
            <Vitals patient={patient} vitals={medicalData.vitals} onClickResource={onClickResource} />
            <Divider />
          </>
        )}
      </Stack>
    </Flex>
  );
}
