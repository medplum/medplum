// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Encounter, Provenance } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ChartNoteStatus } from '../../types/encounter';
import * as notifications from '../../utils/notifications';
import { SignAddendum } from './SignAddendum';

const mockEncounter: WithId<Encounter> = {
  resourceType: 'Encounter',
  id: 'encounter-123',
  status: 'finished',
  class: { code: 'AMB', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode' },
  subject: { reference: 'Patient/patient-123' },
};

const mockProvenance: Provenance = {
  resourceType: 'Provenance',
  id: 'provenance-123',
  target: [{ reference: 'Encounter/encounter-123' }],
  recorded: '2024-01-01T10:00:00Z',
  agent: [
    {
      who: { reference: 'Practitioner/practitioner-123', display: 'Dr. Test' },
    },
  ],
};

describe('SignAddendumCard', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (props: Partial<Parameters<typeof SignAddendum>[0]> = {}): ReturnType<typeof render> => {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <SignAddendum
              encounter={mockEncounter}
              provenances={[]}
              chartNoteStatus={ChartNoteStatus.Unsigned}
              {...props}
            />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('returns null when no provenances', async () => {
    await act(async () => {
      const { container } = setup({ provenances: [] });
      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
    });
  });

  test('renders provenance information', async () => {
    await act(async () => {
      setup({ provenances: [mockProvenance] });
    });

    await waitFor(() => {
      expect(screen.getByText(/Signed by/i)).toBeInTheDocument();
      expect(screen.getByText(/Dr\. Test/i)).toBeInTheDocument();
    });
  });

  test('displays signed and locked status for last provenance', async () => {
    await act(async () => {
      setup({
        provenances: [mockProvenance],
        chartNoteStatus: ChartNoteStatus.SignedAndLocked,
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Signed and Locked by/i)).toBeInTheDocument();
    });
  });

  test('displays addendum form', async () => {
    await act(async () => {
      setup({ provenances: [mockProvenance] });
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add an addendum to this Visit...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add Addendum' })).toBeInTheDocument();
    });
  });

  test('creates addendum when form is submitted', async () => {
    const user = userEvent.setup();
    const createResourceSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue({
      resourceType: 'DocumentReference',
      id: 'doc-new',
      status: 'current',
      date: new Date().toISOString(),
      author: [{ display: 'Dr. Alice Smith' }],
    } as any);

    await act(async () => {
      setup({ provenances: [mockProvenance] });
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add an addendum to this Visit...')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText('Add an addendum to this Visit...');
    await user.type(textarea, 'Test addendum text');

    const submitButton = screen.getByRole('button', { name: 'Add Addendum' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(createResourceSpy).toHaveBeenCalled();
    });
  });

  test('disables submit button when textarea is empty', async () => {
    await act(async () => {
      setup({ provenances: [mockProvenance] });
    });

    await waitFor(() => {
      const submitButton = screen.getByRole('button', { name: 'Add Addendum' });
      expect(submitButton).toBeInTheDocument();
    });

    const submitButton = screen.getByRole('button', { name: 'Add Addendum' });
    expect(submitButton).toBeDisabled();
  });

  test('disables submit button when only whitespace', async () => {
    const user = userEvent.setup();
    await act(async () => {
      setup({ provenances: [mockProvenance] });
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add an addendum to this Visit...')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText('Add an addendum to this Visit...');
    await user.type(textarea, '   ');

    await waitFor(() => {
      const submitButton = screen.getByRole('button', { name: 'Add Addendum' });
      expect(submitButton).toBeDisabled();
    });
  });

  test('loads and displays addendums from DocumentReference', async () => {
    const mockDocumentReference = {
      resourceType: 'DocumentReference' as const,
      id: 'doc-123',
      status: 'current' as const,
      date: '2024-01-02T10:00:00Z',
      author: [{ display: 'Dr. Author' }],
      content: [
        {
          attachment: {
            contentType: 'text/plain',
            data: btoa('Test addendum content'),
          },
        },
      ],
    };

    vi.spyOn(medplum, 'searchResources').mockResolvedValue([mockDocumentReference] as any);

    await act(async () => {
      setup({ provenances: [mockProvenance] });
    });

    await waitFor(() => {
      expect(screen.getByText(/Addendum by/i)).toBeInTheDocument();
      expect(screen.getByText('Test addendum content')).toBeInTheDocument();
    });
  });

  test('handles errors when loading addendums', async () => {
    const error = new Error('Failed to load addendums');
    vi.spyOn(medplum, 'searchResources').mockRejectedValue(error);
    const errorNotificationSpy = vi.spyOn(notifications, 'showErrorNotification');

    await act(async () => {
      setup({ provenances: [mockProvenance] });
    });

    await waitFor(() => {
      expect(errorNotificationSpy).toHaveBeenCalledWith(error);
    });
  });

  test('handles errors when creating addendum', async () => {
    const user = userEvent.setup();
    const error = new Error('Failed to create addendum');
    vi.spyOn(medplum, 'createResource').mockRejectedValue(error);
    const errorNotificationSpy = vi.spyOn(notifications, 'showErrorNotification');

    await act(async () => {
      setup({ provenances: [mockProvenance] });
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Add an addendum to this Visit...')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText('Add an addendum to this Visit...');
    await user.type(textarea, 'Test addendum');

    const submitButton = screen.getByRole('button', { name: 'Add Addendum' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(errorNotificationSpy).toHaveBeenCalledWith(error);
    });
  });

  test('displays multiple provenances', async () => {
    const provenance2: Provenance = {
      ...mockProvenance,
      id: 'provenance-456',
      recorded: '2024-01-02T10:00:00Z',
      agent: [
        {
          who: { reference: 'Practitioner/practitioner-456', display: 'Dr. Another' },
        },
      ],
    };

    await act(async () => {
      setup({ provenances: [mockProvenance, provenance2] });
    });

    await waitFor(() => {
      expect(screen.getByText(/Dr\. Test/i)).toBeInTheDocument();
      expect(screen.getByText(/Dr\. Another/i)).toBeInTheDocument();
    });
  });
});
