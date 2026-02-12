// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { act, render, screen } from '../test-utils/render';
import type { PatientSummaryProps } from './PatientSummary';
import { PatientSummary } from './PatientSummary';
import type { PatientSummarySectionConfig } from './PatientSummary.types';
import {
  AllergiesSection,
  createLabsSection,
  DemographicsSection,
  getDefaultSections,
  InsuranceSection,
  LabsSection,
  MedicationsSection,
  ProblemListSection,
  SexualOrientationSection,
  SmokingStatusSection,
  VitalsSection,
} from './sectionConfigs';
import { summaryResourceListSection } from './SummaryResourceListSection';

const medplum = new MockClient();

describe('PatientSummary', () => {
  async function setup(args: PatientSummaryProps): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <PatientSummary {...args} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  test('Renders', async () => {
    await setup({ patient: HomerSimpson });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Renders with gender missing', async () => {
    await setup({ patient: { ...HomerSimpson, gender: undefined } });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Renders without appointment and encounter links', async () => {
    await setup({
      patient: { ...HomerSimpson, gender: undefined },
    });
    expect(screen.queryByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Renders with subset of built-in sections', async () => {
    await setup({
      patient: HomerSimpson,
      sections: [AllergiesSection, MedicationsSection],
    });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByText('Allergies')).toBeInTheDocument();
    expect(screen.getByText('Medications')).toBeInTheDocument();
    // Vitals should NOT be present since it's not in the sections array
    expect(screen.queryByText('Vitals')).not.toBeInTheDocument();
  });

  test('Renders with custom section using render function', async () => {
    const customSection: PatientSummarySectionConfig = {
      key: 'custom-test',
      title: 'Custom Section',
      render: ({ patient }) => <div data-testid="custom-section">Custom content for {patient.id}</div>,
    };

    await setup({
      patient: HomerSimpson,
      sections: [customSection],
    });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByTestId('custom-section')).toBeInTheDocument();
    expect(screen.getByText('Custom content for 123')).toBeInTheDocument();
  });

  test('Renders with summaryResourceListSection helper', async () => {
    const section = summaryResourceListSection({
      key: 'test-observations',
      title: 'Test Observations',
      search: { resourceType: 'Observation' },
    });

    await setup({
      patient: HomerSimpson,
      sections: [section],
    });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByText('Test Observations')).toBeInTheDocument();
  });

  test('Renders with overridden built-in section title metadata', async () => {
    // The title field is metadata; built-in sections render their own hardcoded titles internally.
    // Overriding the title field does not change what the component renders,
    // but it does allow consumers to use the title for their own purposes (e.g., table of contents).
    const section = { ...AllergiesSection, title: 'Known Allergies' };
    expect(section.title).toBe('Known Allergies');
    expect(section.key).toBe('allergies');

    await setup({
      patient: HomerSimpson,
      sections: [section],
    });

    // The component still renders, and the internal Allergies component shows its own title
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByText('Allergies')).toBeInTheDocument();
  });

  test('Renders section without searches (self-contained data)', async () => {
    const selfContainedSection: PatientSummarySectionConfig = {
      key: 'self-contained',
      title: 'Self Contained',
      render: ({ patient, results }) => (
        <div data-testid="self-contained">
          Patient: {patient.id}, Results count: {results.length}
        </div>
      ),
    };

    await setup({
      patient: HomerSimpson,
      sections: [selfContainedSection],
    });

    expect(screen.getByTestId('self-contained')).toBeInTheDocument();
    expect(screen.getByText('Patient: 123, Results count: 0')).toBeInTheDocument();
  });

  test('Renders with vitals section showing vital signs', async () => {
    await setup({
      patient: HomerSimpson,
      sections: [VitalsSection],
    });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByText('Vitals')).toBeInTheDocument();
  });

  test('Renders summaryResourceListSection with seeded Condition resources', async () => {
    const patientRef = createReference(HomerSimpson);
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

    const section = summaryResourceListSection({
      key: 'conditions',
      title: 'Active Conditions',
      search: { resourceType: 'Condition', patientParam: 'subject' },
    });

    await setup({
      patient: HomerSimpson,
      sections: [section],
    });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByText('Active Conditions')).toBeInTheDocument();
    // Check that the condition names render
    expect(screen.getByText('Hypertension')).toBeInTheDocument();
    expect(screen.getByText('Type 2 diabetes mellitus')).toBeInTheDocument();
  });

  test('Renders summaryResourceListSection with filter option', async () => {
    const patientRef = createReference(HomerSimpson);
    await medplum.createResource({
      resourceType: 'Condition',
      subject: patientRef,
      code: { text: 'Active Condition' },
      clinicalStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
      },
    });
    await medplum.createResource({
      resourceType: 'Condition',
      subject: patientRef,
      code: { text: 'Resolved Condition' },
      clinicalStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'resolved' }],
      },
    });

    const section = summaryResourceListSection({
      key: 'active-conditions',
      title: 'Active Only',
      search: { resourceType: 'Condition', patientParam: 'subject' },
      filter: (resource) => {
        const condition = resource as { clinicalStatus?: { coding?: { code?: string }[] } };
        return condition.clinicalStatus?.coding?.[0]?.code === 'active';
      },
    });

    await setup({
      patient: HomerSimpson,
      sections: [section],
    });

    expect(screen.getByText('Active Only')).toBeInTheDocument();
  });

  test('Renders summaryResourceListSection with getDisplayString, getStatus, and getSecondaryText', async () => {
    const patientRef = createReference(HomerSimpson);
    await medplum.createResource({
      resourceType: 'Condition',
      subject: patientRef,
      code: { text: 'Headache' },
      clinicalStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
      },
    });

    const section = summaryResourceListSection({
      key: 'fancy-conditions',
      title: 'Fancy Conditions',
      search: { resourceType: 'Condition', patientParam: 'subject' },
      getDisplayString: (resource) => {
        const condition = resource as { code?: { text?: string } };
        return `Custom: ${condition.code?.text ?? 'Unknown'}`;
      },
      getStatus: () => ({ label: 'Active', color: 'green' }),
      getSecondaryText: () => 'Extra detail',
    });

    await setup({
      patient: HomerSimpson,
      sections: [section],
    });

    expect(screen.getByText('Fancy Conditions')).toBeInTheDocument();
    // Multiple conditions exist so use getAllByText
    const details = screen.getAllByText('Extra detail');
    expect(details.length).toBeGreaterThan(0);
  });

  test('Renders summaryResourceListSection with sort option', async () => {
    const patientRef = createReference(HomerSimpson);
    await medplum.createResource({
      resourceType: 'Condition',
      subject: patientRef,
      code: { text: 'Zebra Condition' },
    });
    await medplum.createResource({
      resourceType: 'Condition',
      subject: patientRef,
      code: { text: 'Alpha Condition' },
    });

    const section = summaryResourceListSection({
      key: 'sorted-conditions',
      title: 'Sorted Conditions',
      search: { resourceType: 'Condition', patientParam: 'subject' },
      sort: (a, b) => {
        const aText = (a as { code?: { text?: string } }).code?.text ?? '';
        const bText = (b as { code?: { text?: string } }).code?.text ?? '';
        return aText.localeCompare(bText);
      },
    });

    await setup({
      patient: HomerSimpson,
      sections: [section],
    });

    expect(screen.getByText('Sorted Conditions')).toBeInTheDocument();
  });

  test('Renders summaryResourceListSection empty state with (none)', async () => {
    const section = summaryResourceListSection({
      key: 'empty-list',
      title: 'Empty List',
      search: { resourceType: 'NutritionOrder' },
    });

    await setup({
      patient: HomerSimpson,
      sections: [section],
    });

    expect(screen.getByText('Empty List')).toBeInTheDocument();
    expect(screen.getByText('(none)')).toBeInTheDocument();
  });

  test('getDefaultSections returns all built-in sections', () => {
    const sections = getDefaultSections();
    expect(sections).toHaveLength(9);
    expect(sections.map((s) => s.key)).toEqual([
      'demographics',
      'insurance',
      'allergies',
      'problemList',
      'medications',
      'labs',
      'sexualOrientation',
      'smokingStatus',
      'vitals',
    ]);
  });

  test('createLabsSection creates a labs section config', () => {
    const callback = jest.fn();
    const section = createLabsSection(callback);
    expect(section.key).toBe('labs');
    expect(section.title).toBe('Labs');
    expect(section.searches).toHaveLength(2);
    expect(section.searches?.[0].resourceType).toBe('ServiceRequest');
    expect(section.searches?.[1].resourceType).toBe('DiagnosticReport');
  });

  test('Renders with patient Reference', async () => {
    await setup({
      patient: createReference(HomerSimpson),
    });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
  });

  test('Renders demographics section', async () => {
    await setup({
      patient: HomerSimpson,
      sections: [DemographicsSection],
    });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    // HomerSimpson has birthDate='1956-05-12' and gender='male'
    // PatientInfoItem renders the value or placeholder text (label is a tooltip)
    expect(screen.getByText('Male')).toBeInTheDocument();
    // Check placeholders for missing data
    expect(screen.getByText('Add Race & Ethnicity')).toBeInTheDocument();
    expect(screen.getByText('Add Language')).toBeInTheDocument();
    expect(screen.getByText('Add General Practitioner')).toBeInTheDocument();
  });

  test('Renders insurance section', async () => {
    await setup({
      patient: HomerSimpson,
      sections: [InsuranceSection],
    });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByText('Insurance')).toBeInTheDocument();
  });

  test('Renders problem list section', async () => {
    await setup({
      patient: HomerSimpson,
      sections: [ProblemListSection],
    });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByText('Problems')).toBeInTheDocument();
  });

  test('Renders labs section', async () => {
    await setup({
      patient: HomerSimpson,
      sections: [LabsSection],
    });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByText('Labs')).toBeInTheDocument();
  });

  test('Renders sexual orientation section', async () => {
    await setup({
      patient: HomerSimpson,
      sections: [SexualOrientationSection],
    });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByText('Sexual Orientation')).toBeInTheDocument();
  });

  test('Renders smoking status section', async () => {
    await setup({
      patient: HomerSimpson,
      sections: [SmokingStatusSection],
    });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByText('Smoking Status')).toBeInTheDocument();
  });

  test('Renders with multiple sections sharing the same search (deduplication)', async () => {
    // Both sections search for the same resource type with the same params
    // This exercises the search deduplication in usePatientSummaryData
    const section1 = summaryResourceListSection({
      key: 'conditions-1',
      title: 'Conditions View 1',
      search: { resourceType: 'Condition', patientParam: 'subject' },
    });
    const section2 = summaryResourceListSection({
      key: 'conditions-2',
      title: 'Conditions View 2',
      search: { resourceType: 'Condition', patientParam: 'subject' },
    });

    await setup({
      patient: HomerSimpson,
      sections: [section1, section2],
    });

    expect(screen.getByText('Conditions View 1')).toBeInTheDocument();
    expect(screen.getByText('Conditions View 2')).toBeInTheDocument();
  });

  test('Renders with search using additional query params (Record type)', async () => {
    const section = summaryResourceListSection({
      key: 'vital-obs',
      title: 'Vital Observations',
      search: {
        resourceType: 'Observation',
        patientParam: 'subject',
        query: { category: 'vital-signs', _count: 10 },
      },
    });

    await setup({
      patient: HomerSimpson,
      sections: [section],
    });

    expect(screen.getByText('Vital Observations')).toBeInTheDocument();
  });

  test('Renders with all default sections (full integration)', async () => {
    await setup({
      patient: HomerSimpson,
    });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    // Verify several default sections are present
    expect(screen.getByText('Allergies')).toBeInTheDocument();
    expect(screen.getByText('Medications')).toBeInTheDocument();
    expect(screen.getByText('Vitals')).toBeInTheDocument();
    expect(screen.getByText('Insurance')).toBeInTheDocument();
    expect(screen.getByText('Problems')).toBeInTheDocument();
    expect(screen.getByText('Labs')).toBeInTheDocument();
  });

  test('Built-in section configs have correct keys and titles', () => {
    expect(DemographicsSection.key).toBe('demographics');
    expect(DemographicsSection.title).toBe('Demographics');

    expect(InsuranceSection.key).toBe('insurance');
    expect(InsuranceSection.title).toBe('Insurance');
    expect(InsuranceSection.searches).toHaveLength(1);

    expect(AllergiesSection.key).toBe('allergies');
    expect(AllergiesSection.title).toBe('Allergies');
    expect(AllergiesSection.searches?.[0].patientParam).toBe('patient');

    expect(ProblemListSection.key).toBe('problemList');
    expect(ProblemListSection.title).toBe('Problems');

    expect(MedicationsSection.key).toBe('medications');
    expect(MedicationsSection.title).toBe('Medications');

    expect(LabsSection.key).toBe('labs');
    expect(LabsSection.searches).toHaveLength(2);

    expect(SexualOrientationSection.key).toBe('sexualOrientation');
    expect(SexualOrientationSection.searches?.[0].query).toEqual({ code: '76690-7' });

    expect(SmokingStatusSection.key).toBe('smokingStatus');
    expect(SmokingStatusSection.searches?.[0].query).toEqual({ code: '72166-2' });

    expect(VitalsSection.key).toBe('vitals');
    expect(VitalsSection.searches?.[0].query).toEqual({ category: 'vital-signs' });
  });

  test('Renders with empty sections array', async () => {
    await setup({
      patient: HomerSimpson,
      sections: [],
    });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
  });
});
