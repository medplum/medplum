// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box } from '@mantine/core';
import { createReference } from '@medplum/core';
import { HomerSimpson } from '@medplum/mock';
import { useMedplum } from '@medplum/react-hooks';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { PatientSummary } from './PatientSummary';
import { AllergiesSection, MedicationsSection, ProblemListSection, VitalsSection } from './sectionConfigs';
import { summaryResourceListSection } from './SummaryResourceListSection';

export default {
  title: 'Medplum/PatientSummary',
  component: PatientSummary,
} as Meta;

// Default story — renders all built-in sections with Homer Simpson's pre-seeded mock data.
export const Patient = (): JSX.Element => (
  <Box w={350}>
    <PatientSummary patient={HomerSimpson} />
  </Box>
);

// Demonstrates passing a subset of built-in section configs to limit which sections render.
export const SubsetOfSections = (): JSX.Element => (
  <Box w={350}>
    <PatientSummary patient={HomerSimpson} sections={[AllergiesSection, MedicationsSection, VitalsSection]} />
  </Box>
);

// Demonstrates the `summaryResourceListSection` helper for creating custom resource list sections.
// Seeds Condition resources into MockClient so the custom "Active Conditions" section has data
// to render, including status badges derived from clinicalStatus.
export const CustomResourceListSection = (): JSX.Element => {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState(false);
  const patientRef = createReference(HomerSimpson);

  useEffect(() => {
    (async (): Promise<void> => {
      await medplum.createResource({
        resourceType: 'Condition',
        subject: patientRef,
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '38341003', display: 'Hypertension' }],
          text: 'Hypertension',
        },
        clinicalStatus: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
        },
      });
      await medplum.createResource({
        resourceType: 'Condition',
        subject: patientRef,
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '44054006', display: 'Type 2 diabetes mellitus' }],
          text: 'Type 2 diabetes mellitus',
        },
        clinicalStatus: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
        },
      });
      await medplum.createResource({
        resourceType: 'Condition',
        subject: patientRef,
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '84757009', display: 'Epilepsy' }],
          text: 'Epilepsy',
        },
        clinicalStatus: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'resolved' }],
        },
      });
      setLoaded(true);
    })().catch(console.error);
  }, [medplum, patientRef]);

  if (!loaded) {
    return <></>;
  }

  return (
    <Box w={350}>
      <PatientSummary
        patient={HomerSimpson}
        sections={[
          AllergiesSection,
          summaryResourceListSection({
            key: 'conditions',
            title: 'Active Conditions',
            search: { resourceType: 'Condition', patientParam: 'subject' },
            getStatus: (resource) => {
              const status = (resource as { clinicalStatus?: { coding?: { code?: string }[] } }).clinicalStatus
                ?.coding?.[0]?.code;
              return status ? { label: status, color: status === 'active' ? 'green' : 'gray' } : undefined;
            },
          }),
          VitalsSection,
        ]}
      />
    </Box>
  );
};

// Demonstrates mixing built-in sections with a fully custom render function.
// Seeds Condition and MedicationRequest resources so the ProblemList and Medications
// sections have data. The middle section uses a plain render function with no FHIR search.
export const CustomRenderSection = (): JSX.Element => {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState(false);
  const patientRef = createReference(HomerSimpson);

  useEffect(() => {
    (async (): Promise<void> => {
      await medplum.createResource({
        resourceType: 'Condition',
        subject: patientRef,
        code: {
          coding: [{ system: 'http://snomed.info/sct', code: '195967001', display: 'Asthma' }],
          text: 'Asthma',
        },
        clinicalStatus: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
        },
      });
      await medplum.createResource({
        resourceType: 'MedicationRequest',
        subject: patientRef,
        status: 'active',
        intent: 'order',
        medicationCodeableConcept: {
          coding: [
            { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '197361', display: 'Lisinopril 10 MG' },
          ],
          text: 'Lisinopril 10 MG',
        },
      });
      await medplum.createResource({
        resourceType: 'MedicationRequest',
        subject: patientRef,
        status: 'active',
        intent: 'order',
        medicationCodeableConcept: {
          coding: [
            { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '860975', display: 'Metformin 500 MG' },
          ],
          text: 'Metformin 500 MG',
        },
      });
      setLoaded(true);
    })().catch(console.error);
  }, [medplum, patientRef]);

  if (!loaded) {
    return <></>;
  }

  return (
    <Box w={350}>
      <PatientSummary
        patient={HomerSimpson}
        sections={[
          ProblemListSection,
          {
            key: 'custom-notes',
            title: 'Clinical Notes',
            render: ({ patient }) => (
              <div style={{ padding: '8px 0' }}>
                <strong>Clinical Notes</strong>
                <p>Last visit: {patient.name?.[0]?.given?.[0]} reported improved symptoms.</p>
              </div>
            ),
          },
          MedicationsSection,
        ]}
      />
    </Box>
  );
};
