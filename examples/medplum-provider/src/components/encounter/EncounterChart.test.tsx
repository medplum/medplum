// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { ClinicalImpression, Encounter, Practitioner, Provenance, Task } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { EncounterChart } from './EncounterChart';

const mockPractitioner: WithId<Practitioner> = {
  resourceType: 'Practitioner',
  id: 'practitioner-123',
  name: [{ given: ['Dr.'], family: 'Test' }],
};

const mockEncounter: WithId<Encounter> = {
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

  test('switches to details tab when clicked', async () => {
    const user = userEvent.setup();
    setup();

    await waitFor(() => {
      expect(screen.getByText('Visit')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Fill chart note')).toBeInTheDocument();
    });

    const detailsTab = screen.getByText('Details & Billing');
    await user.click(detailsTab);

    await waitFor(() => {
      expect(screen.queryByText('Fill chart note')).not.toBeInTheDocument();
    });
  });

  test('switches back to notes tab when clicked', async () => {
    const user = userEvent.setup();
    setup();

    await waitFor(() => {
      expect(screen.getByText('Visit')).toBeInTheDocument();
    });

    const detailsTab = screen.getByText('Details & Billing');
    await user.click(detailsTab);

    await waitFor(() => {
      expect(screen.queryByText('Fill chart note')).not.toBeInTheDocument();
    });

    const notesTab = screen.getByText('Note & Tasks');
    await user.click(notesTab);

    await waitFor(() => {
      expect(screen.getByText('Fill chart note')).toBeInTheDocument();
    });
  });

  test('displays billing tab content when details tab is active', async () => {
    const user = userEvent.setup();
    setup();

    await waitFor(() => {
      expect(screen.getByText('Visit')).toBeInTheDocument();
    });

    const detailsTab = screen.getByText('Details & Billing');
    await user.click(detailsTab);

    await waitFor(() => {
      expect(screen.queryByText('Fill chart note')).not.toBeInTheDocument();
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

  describe('signing functionality', () => {
    const finishedEncounter: WithId<Encounter> = {
      ...mockEncounter,
      status: 'finished',
    };

    const getSignButton = (): HTMLElement | null => {
      const buttons = screen.getAllByRole('button');
      return buttons.find((btn) => btn.querySelector('svg')) || null;
    };

    test('signs without locking - textarea remains enabled', async () => {
      const user = userEvent.setup();
      const mockProvenance: Provenance = {
        resourceType: 'Provenance',
        id: 'provenance-1',
        target: [createReference(finishedEncounter)],
        recorded: new Date().toISOString(),
        agent: [
          {
            who: createReference(mockPractitioner),
          },
        ],
      };

      // Mock searchResources to return empty initially, then return provenance after signing
      let provenanceReturned = false;
      vi.spyOn(medplum, 'searchResources').mockImplementation((resourceType: string) => {
        if (resourceType === 'Provenance') {
          return Promise.resolve(provenanceReturned ? [mockProvenance] : []) as any;
        }
        if (resourceType === 'ClinicalImpression') {
          return Promise.resolve([mockClinicalImpression]) as any;
        }
        if (resourceType === 'Task') {
          return Promise.resolve([]) as any;
        }
        return Promise.resolve([]) as any;
      });

      vi.spyOn(medplum, 'createResource').mockImplementation(async (resource: any) => {
        if (resource.resourceType === 'Provenance') {
          provenanceReturned = true;
          return mockProvenance as any;
        }
        return resource;
      });

      await medplum.createResource(finishedEncounter);
      setup({ encounter: finishedEncounter });

      await waitFor(() => {
        expect(screen.getByText('Fill chart note')).toBeInTheDocument();
      });

      await waitFor(() => {
        const signButton = getSignButton();
        expect(signButton).toBeInTheDocument();
      });

      const signButton = getSignButton();
      if (signButton) {
        await user.click(signButton);
      }

      await waitFor(() => {
        expect(screen.getByText('Just Sign')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Just Sign'));

      await waitFor(() => {
        expect(medplum.createResource).toHaveBeenCalledWith(
          expect.objectContaining({
            resourceType: 'Provenance',
            target: [createReference(finishedEncounter)],
          })
        );
      });

      // Wait for modal to close and component to update
      // Textarea should still be enabled after signing without locking
      await waitFor(
        () => {
          const chartNoteCard = screen.getByText('Fill chart note').closest('.mantine-Card-root');
          const textarea = chartNoteCard?.querySelector('textarea');
          expect(textarea).not.toBeDisabled();
        },
        { timeout: 3000 }
      );
    });

    test('signs with locking - textarea becomes disabled', async () => {
      const user = userEvent.setup();
      const completedClinicalImpression: ClinicalImpression = {
        ...mockClinicalImpression,
        status: 'completed',
      };
      const mockProvenance: Provenance = {
        resourceType: 'Provenance',
        id: 'provenance-1',
        target: [createReference(finishedEncounter)],
        recorded: new Date().toISOString(),
        agent: [
          {
            who: createReference(mockPractitioner),
          },
        ],
      };

      // Mock searchResources to return empty initially, then return provenance after signing
      let provenanceReturned = false;
      vi.spyOn(medplum, 'searchResources').mockImplementation((resourceType: string) => {
        if (resourceType === 'Provenance') {
          return Promise.resolve(provenanceReturned ? [mockProvenance] : []) as any;
        }
        if (resourceType === 'ClinicalImpression') {
          return Promise.resolve([completedClinicalImpression]) as any;
        }
        if (resourceType === 'Task') {
          return Promise.resolve([]) as any;
        }
        return Promise.resolve([]) as any;
      });

      vi.spyOn(medplum, 'createResource').mockImplementation(async (resource: any) => {
        if (resource.resourceType === 'Provenance') {
          provenanceReturned = true;
          return mockProvenance as any;
        }
        return resource;
      });

      await medplum.createResource(finishedEncounter);
      setup({ encounter: finishedEncounter });

      await waitFor(() => {
        expect(screen.getByText('Fill chart note')).toBeInTheDocument();
      });

      await waitFor(() => {
        const signButton = getSignButton();
        expect(signButton).toBeInTheDocument();
      });

      const signButton = getSignButton();
      if (signButton) {
        await user.click(signButton);
      }

      await waitFor(() => {
        expect(screen.getByText('Sign & Lock Note')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Sign & Lock Note'));

      await waitFor(() => {
        expect(medplum.createResource).toHaveBeenCalledWith(
          expect.objectContaining({
            resourceType: 'Provenance',
            target: [createReference(finishedEncounter)],
          })
        );
      });

      // Wait for modal to close and component to update
      // Textarea should be disabled after signing with locking
      await waitFor(
        () => {
          const chartNoteCard = screen.getByText('Fill chart note').closest('.mantine-Card-root');
          const textarea = chartNoteCard?.querySelector('textarea');
          expect(textarea).toBeDisabled();
        },
        { timeout: 3000 }
      );
    });

    test('signs with locking - completes incomplete tasks', async () => {
      const user = userEvent.setup();
      const incompleteTask: Task = {
        ...mockTask,
        id: 'task-incomplete',
        status: 'in-progress',
      };
      const completedTask: Task = {
        ...incompleteTask,
        status: 'completed',
      };

      const completedClinicalImpression: ClinicalImpression = {
        ...mockClinicalImpression,
        status: 'completed',
      };
      const mockProvenance: Provenance = {
        resourceType: 'Provenance',
        id: 'provenance-1',
        target: [createReference(finishedEncounter)],
        recorded: new Date().toISOString(),
        agent: [
          {
            who: createReference(mockPractitioner),
          },
        ],
      };

      await medplum.createResource(incompleteTask);
      let provenanceReturned = false;
      vi.spyOn(medplum, 'updateResource').mockResolvedValue(completedTask as any);
      vi.spyOn(medplum, 'createResource').mockImplementation(async (resource: any) => {
        if (resource.resourceType === 'Provenance') {
          provenanceReturned = true;
          return mockProvenance as any;
        }
        return resource;
      });
      vi.spyOn(medplum, 'searchResources').mockImplementation((resourceType: string) => {
        if (resourceType === 'Provenance') {
          return Promise.resolve(provenanceReturned ? [mockProvenance] : []) as any;
        }
        if (resourceType === 'ClinicalImpression') {
          return Promise.resolve([completedClinicalImpression]) as any;
        }
        if (resourceType === 'Task') {
          return Promise.resolve([incompleteTask]) as any;
        }
        return Promise.resolve([]) as any;
      });

      await medplum.createResource(finishedEncounter);
      setup({ encounter: finishedEncounter });

      await waitFor(() => {
        expect(screen.getByText('Fill chart note')).toBeInTheDocument();
      });

      await waitFor(() => {
        const signButton = getSignButton();
        expect(signButton).toBeInTheDocument();
      });

      const signButton = getSignButton();
      if (signButton) {
        await user.click(signButton);
      }

      await waitFor(() => {
        expect(screen.getByText('Sign & Lock Note')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Sign & Lock Note'));

      // Verify that incomplete tasks are updated to completed
      await waitFor(
        () => {
          expect(medplum.updateResource).toHaveBeenCalledWith(
            expect.objectContaining({
              resourceType: 'Task',
              id: 'task-incomplete',
              status: 'completed',
            })
          );
        },
        { timeout: 3000 }
      );
    });

    test('signs with locking - does not update already completed tasks', async () => {
      const user = userEvent.setup();
      const completedTask: Task = {
        ...mockTask,
        id: 'task-completed',
        status: 'completed',
      };

      const completedClinicalImpression: ClinicalImpression = {
        ...mockClinicalImpression,
        status: 'completed',
      };
      const mockProvenance: Provenance = {
        resourceType: 'Provenance',
        id: 'provenance-1',
        target: [createReference(finishedEncounter)],
        recorded: new Date().toISOString(),
        agent: [
          {
            who: createReference(mockPractitioner),
          },
        ],
      };

      await medplum.createResource(completedTask);
      let provenanceReturned = false;
      vi.spyOn(medplum, 'updateResource');
      vi.spyOn(medplum, 'createResource').mockImplementation(async (resource: any) => {
        if (resource.resourceType === 'Provenance') {
          provenanceReturned = true;
          return mockProvenance as any;
        }
        return resource;
      });
      vi.spyOn(medplum, 'searchResources').mockImplementation((resourceType: string) => {
        if (resourceType === 'Provenance') {
          return Promise.resolve(provenanceReturned ? [mockProvenance] : []) as any;
        }
        if (resourceType === 'ClinicalImpression') {
          return Promise.resolve([completedClinicalImpression]) as any;
        }
        if (resourceType === 'Task') {
          return Promise.resolve([completedTask]) as any;
        }
        return Promise.resolve([]) as any;
      });

      await medplum.createResource(finishedEncounter);
      setup({ encounter: finishedEncounter });

      await waitFor(() => {
        expect(screen.getByText('Fill chart note')).toBeInTheDocument();
      });

      await waitFor(() => {
        const signButton = getSignButton();
        expect(signButton).toBeInTheDocument();
      });

      const signButton = getSignButton();
      if (signButton) {
        await user.click(signButton);
      }

      await waitFor(() => {
        expect(screen.getByText('Sign & Lock Note')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Sign & Lock Note'));

      await waitFor(
        () => {
          expect(medplum.createResource).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      // Verify that completed tasks are not updated
      const updateCalls = vi.mocked(medplum.updateResource).mock.calls;
      const taskUpdateCalls = updateCalls.filter((call) => call[0]?.resourceType === 'Task');
      expect(taskUpdateCalls).toHaveLength(0);
    });

    test('chart note is disabled when signed and locked', async () => {
      const mockProvenance: Provenance = {
        resourceType: 'Provenance',
        id: 'provenance-1',
        target: [createReference(finishedEncounter)],
        recorded: new Date().toISOString(),
        agent: [
          {
            who: createReference(mockPractitioner),
          },
        ],
      };

      const completedClinicalImpression: ClinicalImpression = {
        ...mockClinicalImpression,
        status: 'completed',
      };

      vi.spyOn(medplum, 'searchResources').mockImplementation((resourceType: string) => {
        if (resourceType === 'Provenance') {
          return [mockProvenance] as any;
        }
        if (resourceType === 'ClinicalImpression') {
          return [completedClinicalImpression] as any;
        }
        return [] as any;
      });

      setup({ encounter: finishedEncounter });

      await waitFor(() => {
        expect(screen.getByText('Fill chart note')).toBeInTheDocument();
      });

      // Textarea should be disabled when signed and locked
      await waitFor(() => {
        const chartNoteCard = screen.getByText('Fill chart note').closest('.mantine-Card-root');
        const textarea = chartNoteCard?.querySelector('textarea');
        expect(textarea).toBeDisabled();
      });
    });

    test('chart note is enabled when signed but not locked', async () => {
      const mockProvenance: Provenance = {
        resourceType: 'Provenance',
        id: 'provenance-1',
        target: [createReference(finishedEncounter)],
        recorded: new Date().toISOString(),
        agent: [
          {
            who: createReference(mockPractitioner),
          },
        ],
      };

      vi.spyOn(medplum, 'searchResources').mockImplementation((resourceType: string) => {
        if (resourceType === 'Provenance') {
          return [mockProvenance] as any;
        }
        if (resourceType === 'ClinicalImpression') {
          return [mockClinicalImpression] as any;
        }
        return [] as any;
      });

      setup({ encounter: finishedEncounter });

      await waitFor(() => {
        expect(screen.getByText('Fill chart note')).toBeInTheDocument();
      });

      // Textarea should be enabled when signed but not locked
      await waitFor(() => {
        const chartNoteCard = screen.getByText('Fill chart note').closest('.mantine-Card-root');
        const textarea = chartNoteCard?.querySelector('textarea');
        expect(textarea).not.toBeDisabled();
      });
    });
  });
});
