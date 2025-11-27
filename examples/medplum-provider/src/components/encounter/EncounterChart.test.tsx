// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedplumProvider } from '@medplum/react';
import type { ClinicalImpression, Encounter, Practitioner, Task } from '@medplum/fhirtypes';
import { HomerSimpson, DrAliceSmith, MockClient } from '@medplum/mock';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { EncounterChart } from './EncounterChart';
import { createReference } from '@medplum/core';

const mockPractitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: 'practitioner-123',
  name: [{ given: ['Dr.'], family: 'Test' }],
};

const mockEncounter: Encounter = {
  resourceType: 'Encounter',
  id: 'encounter-123',
  status: 'in-progress',
  class: {
    system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
    code: 'AMB',
  },
  subject: { reference: `Patient/${HomerSimpson.id}` },
  participant: [
    {
      individual: createReference(mockPractitioner),
    },
  ],
};

const mockClinicalImpression: ClinicalImpression = {
  resourceType: 'ClinicalImpression',
  id: 'clinical-123',
  status: 'in-progress',
  subject: createReference(HomerSimpson),
  encounter: createReference(mockEncounter),
  note: [{ text: 'Test clinical note' }],
};

const mockTask: Task = {
  resourceType: 'Task',
  id: 'task-123',
  status: 'in-progress',
  intent: 'order',
  encounter: createReference(mockEncounter),
  authoredOn: '2024-01-01T10:00:00Z',
};

describe('EncounterChart', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    await medplum.createResource(HomerSimpson);
    await medplum.createResource(DrAliceSmith);
    await medplum.createResource(mockPractitioner);
    await medplum.createResource(mockEncounter);
    await medplum.createResource(mockClinicalImpression);
    vi.clearAllMocks();
  });

  const setup = (props: Partial<Parameters<typeof EncounterChart>[0]> = {}): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <EncounterChart encounter={mockEncounter} {...props} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('renders loading spinner initially', () => {
    setup();
    // The Loading component renders a spinner, not text
    const loader = document.querySelector('.mantine-Loader-root');
    expect(loader).toBeInTheDocument();
  });

  test('renders encounter header after loading', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('Visit')).toBeInTheDocument();
    });
  });

  test('renders chart note textarea', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('Fill chart note')).toBeInTheDocument();
    });

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('Test clinical note');
  });

  test('updates chart note on change', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'updateResource').mockResolvedValue(mockClinicalImpression as any);

    setup();

    await waitFor(() => {
      expect(screen.getByText('Fill chart note')).toBeInTheDocument();
    });

    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, 'Updated note');

    await waitFor(
      () => {
        expect(medplum.updateResource).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });

  test('displays tasks when available', async () => {
    await medplum.createResource(mockTask);

    setup();

    await waitFor(() => {
      expect(screen.getByText('Visit')).toBeInTheDocument();
    });
  });

  test('renders notes tab by default', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('Visit')).toBeInTheDocument();
    });

    // The notes tab should be active by default
    await waitFor(() => {
      expect(screen.getByText('Fill chart note')).toBeInTheDocument();
    });
  });

  test('fetches provenances on mount', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);

    setup();

    await waitFor(() => {
      expect(medplum.searchResources).toHaveBeenCalledWith(
        'Provenance',
        expect.stringContaining('target=Encounter/encounter-123')
      );
    });
  });

  test('chart note is enabled when not signed', async () => {
    vi.spyOn(medplum, 'searchResources').mockImplementation((resourceType: string) => {
      if (resourceType === 'Provenance') {
        return [] as any;
      }
      if (resourceType === 'ClinicalImpression') {
        return [mockClinicalImpression];
      }
      if (resourceType === 'Task') {
        return [];
      }
      return [];
    });

    setup();

    await waitFor(() => {
      expect(screen.getByText('Fill chart note')).toBeInTheDocument();
    });

    const textarea = screen.getByRole('textbox');
    expect(textarea).not.toBeDisabled();
  });

  test('handles encounter status change', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'updateResource').mockResolvedValue({ ...mockEncounter, status: 'finished' } as any);

    setup();

    await waitFor(() => {
      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    const statusButton = screen.getByText('In Progress');
    await user.click(statusButton);

    await waitFor(() => {
      expect(screen.getByText('Finished')).toBeInTheDocument();
    });
  });

  test('renders with encounter reference', async () => {
    const encounterRef = { reference: 'Encounter/encounter-123' };

    await act(async () => {
      setup({ encounter: encounterRef });
    });

    await waitFor(() => {
      expect(screen.getByText('Visit')).toBeInTheDocument();
    });
  });

  test('fetches tasks for encounter', async () => {
    await medplum.createResource(mockTask);

    vi.spyOn(medplum, 'searchResources');

    setup();

    await waitFor(() => {
      expect(medplum.searchResources).toHaveBeenCalledWith(
        'Task',
        expect.stringContaining('encounter=Encounter/encounter-123'),
        expect.any(Object)
      );
    });
  });

  test('fetches clinical impressions for encounter', async () => {
    vi.spyOn(medplum, 'searchResources');

    setup();

    await waitFor(() => {
      expect(medplum.searchResources).toHaveBeenCalledWith(
        'ClinicalImpression',
        expect.stringContaining('encounter=Encounter/encounter-123')
      );
    });
  });
});
