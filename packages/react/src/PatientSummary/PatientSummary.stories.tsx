// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Box, Group, RingProgress, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core';
import { createReference } from '@medplum/core';
import type { Observation, RiskAssessment } from '@medplum/fhirtypes';
import { HomerSimpson } from '@medplum/mock';
import { useMedplum } from '@medplum/react-hooks';
import type { Meta } from '@storybook/react';
import { IconAlertTriangle, IconCircleCheck, IconFlame, IconShieldExclamation } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
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

// Demonstrates `summaryResourceListSection` — a helper that renders a FHIR search result as a
// standard list without writing custom render code.
// Seeds a pregnancy status Observation (LOINC 82810-3) so the section has data to display.
let customResourceListSeedPromise: Promise<void> | undefined;

export const CustomResourceListSection = (): JSX.Element => {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState(false);
  const patientRef = useMemo(() => createReference(HomerSimpson), []);

  useEffect(() => {
    if (!customResourceListSeedPromise) {
      customResourceListSeedPromise = medplum
        .createResource({
          resourceType: 'Observation',
          status: 'final',
          subject: patientRef,
          effectiveDateTime: '2026-02-01',
          code: {
            coding: [{ system: 'http://loinc.org', code: '82810-3', display: 'Pregnancy status' }],
            text: 'Pregnancy status',
          },
          valueCodeableConcept: {
            coding: [{ system: 'http://loinc.org', code: 'LA15173-0', display: 'Pregnant' }],
            text: 'Pregnant',
          },
        })
        .then(() => undefined);
    }
    customResourceListSeedPromise.then(() => setLoaded(true)).catch(console.error);
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
            key: 'pregnancy-status',
            title: 'Pregnancy Status',
            search: { resourceType: 'Observation', patientParam: 'subject', query: { code: '82810-3' } },
            getDisplayString: (resource) => {
              const obs = resource as Observation;
              return obs.valueCodeableConcept?.text ?? obs.valueCodeableConcept?.coding?.[0]?.display ?? 'Unknown';
            },
            getStatus: (resource) => {
              const code = (resource as Observation).valueCodeableConcept?.coding?.[0]?.code;
              if (code === 'LA15173-0') {
                return { label: 'Pregnant', color: 'pink' };
              }
              if (code === 'LA26683-5') {
                return { label: 'Not pregnant', color: 'gray' };
              }
              return undefined;
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
let customRenderSeedPromise: Promise<void> | undefined;

export const CustomRenderSection = (): JSX.Element => {
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState(false);
  const patientRef = useMemo(() => createReference(HomerSimpson), []);

  useEffect(() => {
    if (!customRenderSeedPromise) {
      customRenderSeedPromise = (async (): Promise<void> => {
        await medplum.createResource({
          resourceType: 'RiskAssessment',
          status: 'final',
          subject: patientRef,
          occurrenceDateTime: '2026-02-15',
          method: { text: 'Framingham Risk Score' },
          prediction: [
            {
              outcome: { text: '10-year cardiovascular event' },
              probabilityDecimal: 0.72,
              qualitativeRisk: {
                coding: [
                  { system: 'http://terminology.hl7.org/CodeSystem/risk-probability', code: 'high', display: 'High' },
                ],
              },
            },
          ],
        });
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
      })();
    }
    customRenderSeedPromise.then(() => setLoaded(true)).catch(console.error);
  }, [medplum, patientRef]);

  if (!loaded) {
    return <></>;
  }

  return (
    <Box w={350}>
      <PatientSummary
        patient={HomerSimpson}
        sections={[
          {
            key: 'risk-score',
            title: 'Risk & Alerts',
            searches: [{ key: 'riskAssessments', resourceType: 'RiskAssessment', patientParam: 'subject' }],
            component: ({ patient, results }) => {
              const firstName = patient.name?.[0]?.given?.[0] ?? 'Patient';
              const ra = (results['riskAssessments'] as RiskAssessment[])?.[0];
              const probability = ra?.prediction?.[0]?.probabilityDecimal;
              const riskScore = probability !== undefined ? Math.round(probability * 100) : undefined;
              const qualCode = ra?.prediction?.[0]?.qualitativeRisk?.coding?.[0]?.code;
              let ringColor = 'yellow';
              if (qualCode === 'high') {
                ringColor = 'red';
              } else if (qualCode === 'moderate') {
                ringColor = 'orange';
              }
              const badgeLabel = qualCode ? qualCode.toUpperCase() + ' RISK' : 'UNKNOWN';
              const alerts = [
                { icon: <IconFlame size={14} />, label: 'High cardiovascular risk', color: 'red' },
                { icon: <IconAlertTriangle size={14} />, label: 'A1c overdue (14 mo)', color: 'orange' },
                { icon: <IconShieldExclamation size={14} />, label: 'Colonoscopy due', color: 'yellow' },
                { icon: <IconCircleCheck size={14} />, label: 'Flu vaccine current', color: 'green' },
              ];
              if (!ra || riskScore === undefined) {
                return (
                  <Text fz="sm" c="dimmed" py={8}>
                    No risk assessment on file
                  </Text>
                );
              }
              return (
                <Stack gap={8} py={8}>
                  <Group gap="md" align="center" wrap="nowrap">
                    <Tooltip
                      label={`${firstName}'s composite risk score (${ra.method?.text ?? 'risk model'})`}
                      position="right"
                    >
                      <RingProgress
                        size={72}
                        thickness={8}
                        roundCaps
                        sections={[
                          { value: riskScore, color: ringColor },
                          { value: 100 - riskScore, color: 'var(--mantine-color-gray-2)' },
                        ]}
                        label={
                          <Text ta="center" fz={13} fw={800} c={ringColor}>
                            {riskScore}
                          </Text>
                        }
                      />
                    </Tooltip>
                    <Stack gap={4} style={{ flex: 1 }}>
                      <Text fz="xs" fw={700} tt="uppercase" c="dimmed" lh={1}>
                        {ra.prediction?.[0]?.outcome?.text ?? 'Risk Score'}
                      </Text>
                      <Badge color={ringColor} variant="light" size="lg" radius="sm">
                        {badgeLabel}
                      </Badge>
                      <Text fz="xs" c="dimmed">
                        {ra.method?.text ?? 'Risk model'}
                      </Text>
                    </Stack>
                  </Group>
                  <Stack gap={4}>
                    {alerts.map((alert) => (
                      <Group key={alert.label} gap={6} wrap="nowrap">
                        <ThemeIcon color={alert.color} variant="light" size={20} radius="xl">
                          {alert.icon}
                        </ThemeIcon>
                        <Text
                          fz="xs"
                          c={alert.color === 'green' ? 'dimmed' : undefined}
                          fw={alert.color === 'green' ? 400 : 600}
                        >
                          {alert.label}
                        </Text>
                      </Group>
                    ))}
                  </Stack>
                </Stack>
              );
            },
          },
          ProblemListSection,
          MedicationsSection,
        ]}
      />
    </Box>
  );
};
