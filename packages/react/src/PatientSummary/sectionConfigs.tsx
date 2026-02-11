// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack } from '@mantine/core';
import { calculateAgeString, formatAddress } from '@medplum/core';
import type {
  AllergyIntolerance,
  Condition,
  Coverage,
  DiagnosticReport,
  MedicationRequest,
  Observation,
  ServiceRequest,
} from '@medplum/fhirtypes';
import {
  IconBinaryTree,
  IconCake,
  IconEmpathize,
  IconLanguage,
  IconMapPin,
  IconStethoscope,
} from '@tabler/icons-react';
import { Allergies } from './Allergies';
import { Insurance } from './Insurance';
import { Labs } from './Labs';
import { Medications } from './Medications';
import { PatientInfoItem } from './PatientInfoItem';
import type { PatientSummarySectionConfig, SectionRenderContext } from './PatientSummary.types';
import {
  formatPatientGenderDisplay,
  formatPatientRaceEthnicityDisplay,
  getEthnicity,
  getGeneralPractitioner,
  getPreferredLanguage,
  getRace,
} from './PatientSummary.utils';
import { ProblemList } from './ProblemList';
import { SexualOrientation } from './SexualOrientation';
import { SmokingStatus } from './SmokingStatus';
import { Vitals } from './Vitals';

/** Demographics section — no FHIR searches, renders patient info items directly. */
export const DemographicsSection: PatientSummarySectionConfig = {
  key: 'demographics',
  title: 'Demographics',
  render: ({ patient, onClickResource }: SectionRenderContext) => {
    const languageDisplay = getPreferredLanguage(patient);
    return (
      <Stack gap="xs" py={8}>
        <PatientInfoItem
          patient={patient}
          value={patient.birthDate ? `${patient.birthDate} (${calculateAgeString(patient.birthDate)})` : undefined}
          icon={<IconCake size={16} stroke={2} color="var(--mantine-color-gray-6)" />}
          placeholder="Add Birthdate"
          label="Birthdate & Age"
          onClickResource={onClickResource}
        />
        <PatientInfoItem
          patient={patient}
          value={patient.gender ? formatPatientGenderDisplay(patient) : undefined}
          icon={<IconEmpathize size={16} stroke={2} color="var(--mantine-color-gray-6)" />}
          placeholder="Add Gender & Identity"
          label="Gender & Identity"
          onClickResource={onClickResource}
        />
        <PatientInfoItem
          patient={patient}
          value={getRace(patient) || getEthnicity(patient) ? formatPatientRaceEthnicityDisplay(patient) : undefined}
          icon={<IconBinaryTree size={16} stroke={2} color="var(--mantine-color-gray-6)" />}
          placeholder="Add Race & Ethnicity"
          label="Race & Ethnicity"
          onClickResource={onClickResource}
        />
        <PatientInfoItem
          patient={patient}
          value={patient.address?.[0] ? formatAddress(patient.address[0]) : undefined}
          icon={<IconMapPin size={16} stroke={2} color="var(--mantine-color-gray-6)" />}
          placeholder="Add Location"
          label="Location"
          onClickResource={onClickResource}
        />
        <PatientInfoItem
          patient={patient}
          value={languageDisplay}
          icon={<IconLanguage size={16} stroke={2} color="var(--mantine-color-gray-6)" />}
          placeholder="Add Language"
          label="Language"
          onClickResource={onClickResource}
        />
        <PatientInfoItem
          patient={patient}
          value={getGeneralPractitioner(patient)}
          icon={<IconStethoscope size={16} stroke={2} color="var(--mantine-color-gray-6)" />}
          placeholder="Add General Practitioner"
          label="General Practitioner"
          onClickResource={onClickResource}
        />
      </Stack>
    );
  },
};

/** Insurance section — searches for Coverage resources. */
export const InsuranceSection: PatientSummarySectionConfig = {
  key: 'insurance',
  title: 'Insurance',
  searches: [{ resourceType: 'Coverage', patientParam: 'beneficiary' }],
  render: ({ results, onClickResource }: SectionRenderContext) => (
    <Insurance coverages={(results[0] as Coverage[]) || []} onClickResource={onClickResource} />
  ),
};

/** Allergies section — searches for AllergyIntolerance resources. */
export const AllergiesSection: PatientSummarySectionConfig = {
  key: 'allergies',
  title: 'Allergies',
  searches: [{ resourceType: 'AllergyIntolerance', patientParam: 'patient' }],
  render: ({ results, patient, onClickResource }: SectionRenderContext) => (
    <Allergies
      patient={patient}
      allergies={(results[0] as AllergyIntolerance[]) || []}
      onClickResource={onClickResource}
    />
  ),
};

/** Problem List section — searches for Condition resources. */
export const ProblemListSection: PatientSummarySectionConfig = {
  key: 'problemList',
  title: 'Problems',
  searches: [{ resourceType: 'Condition', patientParam: 'patient' }],
  render: ({ results, patient, onClickResource }: SectionRenderContext) => (
    <ProblemList
      patient={patient}
      problems={(results[0] as Condition[]) || []}
      onClickResource={onClickResource}
    />
  ),
};

/** Medications section — searches for MedicationRequest resources. */
export const MedicationsSection: PatientSummarySectionConfig = {
  key: 'medications',
  title: 'Medications',
  searches: [{ resourceType: 'MedicationRequest', patientParam: 'subject' }],
  render: ({ results, patient, onClickResource }: SectionRenderContext) => (
    <Medications
      patient={patient}
      medicationRequests={(results[0] as MedicationRequest[]) || []}
      onClickResource={onClickResource}
    />
  ),
};

/**
 * Labs section — searches for both ServiceRequest and DiagnosticReport resources.
 * Accepts an optional `onRequestLabs` callback via closure.
 */
export function createLabsSection(onRequestLabs?: () => void): PatientSummarySectionConfig {
  return {
    key: 'labs',
    title: 'Labs',
    searches: [
      { resourceType: 'ServiceRequest', patientParam: 'subject' },
      { resourceType: 'DiagnosticReport', patientParam: 'subject' },
    ],
    render: ({ results, patient, onClickResource }: SectionRenderContext) => (
      <Labs
        patient={patient}
        serviceRequests={(results[0] as ServiceRequest[]) || []}
        diagnosticReports={(results[1] as DiagnosticReport[]) || []}
        onClickResource={onClickResource}
        onRequestLabs={onRequestLabs}
      />
    ),
  };
}

/** Default Labs section constant (no onRequestLabs callback). */
export const LabsSection: PatientSummarySectionConfig = createLabsSection();

/** Sexual Orientation section — searches for Observation resources by LOINC 76690-7. */
export const SexualOrientationSection: PatientSummarySectionConfig = {
  key: 'sexualOrientation',
  title: 'Sexual Orientation',
  searches: [{ resourceType: 'Observation', patientParam: 'subject', query: { code: '76690-7' } }],
  render: ({ results, patient, onClickResource }: SectionRenderContext) => {
    const observations = (results[0] as Observation[]) || [];
    return (
      <SexualOrientation
        patient={patient}
        sexualOrientation={observations[0]}
        onClickResource={onClickResource}
      />
    );
  },
};

/** Smoking Status section — searches for Observation resources by LOINC 72166-2. */
export const SmokingStatusSection: PatientSummarySectionConfig = {
  key: 'smokingStatus',
  title: 'Smoking Status',
  searches: [{ resourceType: 'Observation', patientParam: 'subject', query: { code: '72166-2' } }],
  render: ({ results, patient, onClickResource }: SectionRenderContext) => {
    const observations = (results[0] as Observation[]) || [];
    return (
      <SmokingStatus
        patient={patient}
        smokingStatus={observations[0]}
        onClickResource={onClickResource}
      />
    );
  },
};

/** Vitals section — searches for Observation resources with category vital-signs. */
export const VitalsSection: PatientSummarySectionConfig = {
  key: 'vitals',
  title: 'Vitals',
  searches: [{ resourceType: 'Observation', patientParam: 'subject', query: { category: 'vital-signs' } }],
  render: ({ results, patient, onClickResource }: SectionRenderContext) => {
    const observations = (results[0] as Observation[]) || [];
    return (
      <Vitals
        patient={patient}
        vitals={observations}
        onClickResource={onClickResource}
      />
    );
  },
};

/**
 * Returns the default set of sections, matching the original hardcoded PatientSummary layout.
 * The `onRequestLabs` callback is threaded through to the Labs section.
 */
export function getDefaultSections(onRequestLabs?: () => void): PatientSummarySectionConfig[] {
  return [
    DemographicsSection,
    InsuranceSection,
    AllergiesSection,
    ProblemListSection,
    MedicationsSection,
    createLabsSection(onRequestLabs),
    SexualOrientationSection,
    SmokingStatusSection,
    VitalsSection,
  ];
}

