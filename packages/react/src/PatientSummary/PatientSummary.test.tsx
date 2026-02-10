// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router';
import { act, render, screen } from '../test-utils/render';
import type { PatientSummaryProps } from './PatientSummary';
import { PatientSummary } from './PatientSummary';
import { AllergiesSection, MedicationsSection, VitalsSection } from './sectionConfigs';
import type { PatientSummarySectionConfig } from './PatientSummary.types';
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
});
