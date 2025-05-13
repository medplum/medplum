import { Divider, Group, Stack, Text, Tooltip, ActionIcon, Box } from '@mantine/core';
import { calculateAgeString, formatHumanName, resolveId } from '@medplum/core';
import {
  AllergyIntolerance,
  Appointment,
  Condition,
  Coverage,
  Encounter,
  HumanName,
  MedicationRequest,
  Observation,
  Patient,
  Reference,
  Resource,
  Immunization,
  Procedure,
  Device,
  Goal,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
<<<<<<< HEAD
import { IconStethoscope, IconCake, IconMenuOrder, IconSquareChevronsUp, IconSquareChevronsDown, IconEmpathize, IconBinaryTree, IconMapPin, IconLanguage, IconChevronRight } from '@tabler/icons-react';
import { useEffect, useState, useRef } from 'react';
=======
import { IconGenderFemale, IconGenderMale, IconStethoscope, IconUserSquare } from '@tabler/icons-react';
import { JSX, ReactNode, useEffect, useMemo, useState } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
>>>>>>> 4cb9bdde1003c3442929ae147d71f8e9fa439015
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import { Allergies } from './Allergies';
import { Contact } from './Contact';
import { Insurance } from './Insurance';
import { Medications } from './Medications';
import { ProblemList } from './ProblemList';
import { Vitals } from './Vitals';
import { Visits } from './Visits';
import { Immunizations } from './Immunizations';
import { Procedures } from './Procedures';
import { Devices } from './Devices';
import { SocialHistory } from './SocialHistory';
import { Goals } from './Goals';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import styles from './PatientSummary.module.css';

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

function getGenderIdentity(patient: Patient): string | undefined {
  const genderIdentityExt = patient.extension?.find(
    (ext) => ext.url === 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-genderIdentity'
  );
  return genderIdentityExt?.valueCodeableConcept?.coding?.[0]?.display;
}

function getBirthSex(patient: Patient): string | undefined {
  const birthSexExt = patient.extension?.find(
    (ext) => ext.url === 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex'
  );
  return birthSexExt?.valueCode;
}

function getRace(patient: Patient): string | undefined {
  const raceExt = patient.extension?.find(
    (ext) => ext.url === 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race'
  );
  return raceExt?.extension?.find((subExt) => subExt.url === 'ombCategory')?.valueCoding?.display;
}

function getEthnicity(patient: Patient): string | undefined {
  const ethnicityExt = patient.extension?.find(
    (ext) => ext.url === 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity'
  );
  return ethnicityExt?.extension?.find((subExt) => subExt.url === 'ombCategory')?.valueCoding?.display;
}

function getLanguages(patient: Patient): { preferred?: string; other?: string } {
  const languages: { preferred?: string; other?: string } = {};
  patient.communication?.forEach((comm) => {
    const language = comm.language?.coding?.[0]?.display;
    if (comm.preferred) {
      languages.preferred = language;
    } else {
      languages.other = language;
    }
  });
  return languages;
}

function getGeneralPractitioner(patient: Patient): string | undefined {
  return patient.generalPractitioner?.[0]?.display;
}

export function PatientSummary(props: PatientSummaryProps): JSX.Element | null {
  const medplum = useMedplum();
  const {
    patient: propsPatient,
    onClickResource,
  } = props;
  const patient = useResource(propsPatient);
  const [medicalData, setMedicalData] = useState<PatientMedicalData>();
  const [createdDate, setCreatedDate] = useState<string | undefined>();
  const patientId = resolveId(patient);
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
            obs.category?.some(cat => cat.coding?.some(coding => coding.code === 'social-history'))
          ),
        });
      })
      .catch(console.error);
  }, [medplum, propsPatient]);

  useEffect(() => {
    if (patient?.id) {
      medplum.readHistory('Patient', patient.id)
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
    <div style={{ height: '100%', width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', backgroundColor: 'white' }}>
      <MedplumLink to={`/Patient/${patientId}/edit`} style={{ textDecoration: 'none', display: 'block', color: 'black' }}>
        <div style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1, padding: '16px 16px 0 16px', cursor: 'pointer', minWidth: 0 }} className={styles.patientSummaryListItem}>
          <Group align="center" gap="sm" mb={16} style={{ position: 'relative', minWidth: 0 }}>
            <ResourceAvatar value={patient} size={48} radius={48} style={{ border: '2px solid white' }} />
            <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
              <Tooltip label={formatHumanName(patient.name?.[0] as HumanName)} position="top-start" openDelay={650} disabled={!isNameOverflowed}>
                <Text fz="h4" fw={800} truncate style={{ minWidth: 0 }} ref={nameRef}>
                  {formatHumanName(patient.name?.[0] as HumanName)}
                </Text>
              </Tooltip>
              {(() => {
                const dateString = typeof createdDate === 'string' && createdDate.length > 0 ? createdDate : undefined;
                if (!dateString) { return null; }
                const d = new Date(dateString);
                return (
                  <Text fz="xs" mt={-2} fw={500} c="gray.6" truncate style={{ minWidth: 0 }}>
                    Patient since {d.getMonth() + 1}/{d.getDate()}/{d.getFullYear()}
                  </Text>
                );
              })()}
            </Stack>
            <div className={styles.patientSummaryGradient} />
            <div className={styles.patientSummaryChevronContainer} style={{ alignItems: 'center' }}>
              <ActionIcon className={styles.patientSummaryChevron} size="md" variant="transparent" tabIndex={-1}>
                <IconChevronRight size={16} stroke={2.5} />
              </ActionIcon>
            </div>
          </Group>
          <Divider />
        </div>
      </MedplumLink>
      <Stack gap="xs" px={16} pt={12} pb={16} style={{ flex: 2, overflowY: 'auto', minHeight: 0 }}>
        {medicalData && (
          <>
            <Stack gap="xs" py={8}>
              <MedplumLink to={`/Patient/${patientId}/edit`} style={{ textDecoration: 'none', display: 'block', color: 'black' }}>
                <Box className={styles.patientSummaryListItem}>
                  <Tooltip label="Birthdate & Age" position="top-start" openDelay={650}>
                    <Group gap="sm" align="center" style={{ cursor: 'pointer', flexWrap: 'nowrap', minWidth: 0 }}>
                      <IconCake size={16} style={{ marginLeft: '6', marginRight: '2' }} stroke={2} color="var(--mantine-color-gray-6)" />
                      <Text fz="sm" fw={400} truncate style={{ flex: 1, minWidth: 0 }}>
                        {patient.birthDate ? new Date(patient.birthDate).toLocaleDateString('en-US', {
                          month: 'numeric',
                          day: 'numeric',
                          year: 'numeric'
                        }) : 'No birth date'} · {(() => {
                          if (!patient.birthDate) { return '0 years old'; }
                          const ageStr = calculateAgeString(patient.birthDate);
                          if (!ageStr) { return '0 years old'; }
                          const age = parseInt(ageStr, 10);
                          return `${isNaN(age) ? '0' : age} years old`;
                        })()}
                      </Text>
                    </Group>
                  </Tooltip>
                  <div className={styles.patientSummaryGradient} />
                  <div className={styles.patientSummaryChevronContainer}>
                    <ActionIcon className={styles.patientSummaryChevron} size="md" variant="transparent" tabIndex={-1}>
                      <IconChevronRight size={16} stroke={2.5} />
                    </ActionIcon>
                  </div>
                </Box>
              </MedplumLink>

              <MedplumLink to={`/Patient/${patientId}/edit`} style={{ textDecoration: 'none', display: 'block', color: 'black' }}>
                <Box className={styles.patientSummaryListItem}>
                  <Tooltip label="Gender & Identity" position="top-start" openDelay={650}>
                    <Group gap="sm" align="center" style={{ cursor: 'pointer', flexWrap: 'nowrap', minWidth: 0 }}>
                      <IconEmpathize size={16} style={{ marginLeft: '6', marginRight: '2' }} stroke={2} color="var(--mantine-color-gray-6)" />
                      <Text fz="sm" fw={400} truncate style={{ flex: 1, minWidth: 0 }}>
                        {patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : 'Add Gender'} · Identifies as {getGenderIdentity(patient) || 'Add Gender Identity'}
                        {getBirthSex(patient) && ` · Born as ${getBirthSex(patient)}`}
                      </Text>
                    </Group>
                  </Tooltip>
                  <div className={styles.patientSummaryGradient} />
                  <div className={styles.patientSummaryChevronContainer}>
                    <ActionIcon className={styles.patientSummaryChevron} size="md" variant="transparent" tabIndex={-1}>
                      <IconChevronRight size={16} stroke={2.5} />
                    </ActionIcon>
                  </div>
                </Box>
              </MedplumLink>

              <MedplumLink to={`/Patient/${patientId}/edit`} style={{ textDecoration: 'none', display: 'block', color: 'black' }}>
                <Box className={styles.patientSummaryListItem}>
                  <Tooltip label="Race & Ethnicity" position="top-start" openDelay={650}>
                    <Group gap="sm" align="center" style={{ cursor: 'pointer', flexWrap: 'nowrap', minWidth: 0 }}>
                      <IconBinaryTree size={16} style={{ marginLeft: '6', marginRight: '2' }} stroke={2} color="var(--mantine-color-gray-6)" />
                      <Text fz="sm" fw={400} truncate style={{ flex: 1, minWidth: 0 }}>
                        {getRace(patient) || 'Add Race'} · {getEthnicity(patient) || 'Add Ethnicity'}
                      </Text>
                    </Group>
                  </Tooltip>
                  <div className={styles.patientSummaryGradient} />
                  <div className={styles.patientSummaryChevronContainer}>
                    <ActionIcon className={styles.patientSummaryChevron} size="md" variant="transparent" tabIndex={-1}>
                      <IconChevronRight size={16} stroke={2.5} />
                    </ActionIcon>
                  </div>
                </Box>
              </MedplumLink>

              {patient.address?.[0] && (
                <MedplumLink to={`/Patient/${patientId}/edit`} style={{ textDecoration: 'none', display: 'block', color: 'black' }}>
                  <Box className={styles.patientSummaryListItem}>
                    <Tooltip label="Location" position="top-start" openDelay={650}>
                      <Group gap="sm" align="center" style={{ cursor: 'pointer', flexWrap: 'nowrap', minWidth: 0 }}>
                        <IconMapPin size={16} style={{ marginLeft: '6', marginRight: '2' }} stroke={2} color="var(--mantine-color-gray-6)" />
                        <Text fz="sm" fw={400} truncate style={{ flex: 1, minWidth: 0 }}>
                          {patient.address[0].city || 'Add City'}, {patient.address[0].state || 'Add State'}
                        </Text>
                      </Group>
                    </Tooltip>
                    <div className={styles.patientSummaryGradient} />
                    <div className={styles.patientSummaryChevronContainer}>
                      <ActionIcon className={styles.patientSummaryChevron} size="md" variant="transparent" tabIndex={-1}>
                        <IconChevronRight size={16} stroke={2.5} />
                      </ActionIcon>
                    </div>
                  </Box>
                </MedplumLink>
              )}

              {patient.communication && patient.communication.length > 0 && (
                <MedplumLink to={`/Patient/${patientId}/edit`} style={{ textDecoration: 'none', display: 'block', color: 'black' }}>
                  <Box className={styles.patientSummaryListItem}>
                    <Tooltip label="Language" position="top-start" openDelay={650}>
                      <Group gap="sm" align="center" style={{ cursor: 'pointer', flexWrap: 'nowrap', minWidth: 0 }}>
                        <IconLanguage size={16} style={{ marginLeft: '6', marginRight: '2' }} stroke={2} color="var(--mantine-color-gray-6)" />
                        <Text fz="sm" fw={400} truncate style={{ flex: 1, minWidth: 0 }}>
                          {getLanguages(patient).preferred || 'Add Language'} {getLanguages(patient).preferred ? '(Preferred)' : ''} · {getLanguages(patient).other || 'Add Language'}
                        </Text>
                      </Group>
                    </Tooltip>
                    <div className={styles.patientSummaryGradient} />
                    <div className={styles.patientSummaryChevronContainer}>
                      <ActionIcon className={styles.patientSummaryChevron} size="md" variant="transparent" tabIndex={-1}>
                        <IconChevronRight size={16} stroke={2.5} />
                      </ActionIcon>
                    </div>
                  </Box>
                </MedplumLink>
              )}

              {patient.generalPractitioner && patient.generalPractitioner.length > 0 && (
                <MedplumLink to={`/Patient/${patientId}/edit`} style={{ textDecoration: 'none', display: 'block', color: 'black' }}>
                  <Box className={styles.patientSummaryListItem}>
                    <Tooltip label="General Practitioner" position="top-start" openDelay={650}>
                      <Group gap="sm" align="center" style={{ cursor: 'pointer', flexWrap: 'nowrap', minWidth: 0 }}>
                        <IconStethoscope size={16} style={{ marginLeft: '6', marginRight: '2' }} stroke={2} color="var(--mantine-color-gray-6)" />
                        <Text fz="sm" fw={400} truncate style={{ flex: 1, minWidth: 0 }}>
                          {getGeneralPractitioner(patient) || 'Add General Practitioner'}
                        </Text>
                      </Group>
                    </Tooltip>
                    <div className={styles.patientSummaryGradient} />
                    <div className={styles.patientSummaryChevronContainer}>
                      <ActionIcon className={styles.patientSummaryChevron} size="md" variant="transparent" tabIndex={-1}>
                        <IconChevronRight size={16} stroke={2.5} />
                      </ActionIcon>
                    </div>
                  </Box>
                </MedplumLink>
              )}
            </Stack>
            <Divider />
            <Contact patient={patient} onClickResource={onClickResource} />
            <Divider />
            <Immunizations patient={patient} immunizations={medicalData.immunizations || []} onClickResource={onClickResource} />
            <Divider />
            <Visits patient={patient} appointments={medicalData.appointments || []} encounters={medicalData.encounters || []} onClickResource={onClickResource} />
            <Divider />
            <Insurance patient={patient} coverages={medicalData.coverages || []} onClickResource={onClickResource} />
            <Divider />
            <Allergies patient={patient} allergies={medicalData.allergies} onClickResource={onClickResource} />
            <Divider />
            <ProblemList patient={patient} problems={medicalData.problems} onClickResource={onClickResource} />
            <Divider />
            <Procedures patient={patient} procedures={medicalData.procedures || []} onClickResource={onClickResource} />
            <Divider />
            <Devices patient={patient} devices={medicalData.devices || []} onClickResource={onClickResource} />
            <Divider />
            <Medications
              patient={patient}
              medicationRequests={medicalData.medicationRequests}
              onClickResource={onClickResource}
            />
            <Divider />
            <SocialHistory
              patient={patient}
              observations={medicalData.socialHistory}
              onClickResource={onClickResource}
            />
            <Divider />
            <Goals patient={patient} goals={medicalData.goals || []} onClickResource={onClickResource} />
            <Divider />
            <Vitals patient={patient} vitals={medicalData.vitals} onClickResource={onClickResource} />
            <Divider />
          </>
        )}
      </Stack>
      <div style={{ 
        position: 'sticky',
        bottom: 0,
        backgroundColor: 'white',
        zIndex: 1000,
        padding: '12px 16px',
        borderTop: '1px solid var(--mantine-color-gray-3)'
      }}>
        <Group justify="space-between">
          <Group>
            <IconSquareChevronsUp size={20} style={{ cursor: 'pointer' }} />
            <IconSquareChevronsDown size={20} style={{ cursor: 'pointer' }} />
          </Group>
          <IconMenuOrder size={20} style={{ cursor: 'pointer' }} />
        </Group>
      </div>
    </div>
  );
}

