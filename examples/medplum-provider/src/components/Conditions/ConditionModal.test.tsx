// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Encounter, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import ConditionModal from './ConditionModal';

const mockPatient: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [{ given: ['John'], family: 'Doe' }],
};

const mockEncounter: WithId<Encounter> = {
  resourceType: 'Encounter',
  id: 'encounter-123',
  status: 'in-progress',
  class: {
    system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
    code: 'AMB',
  },
  subject: { reference: 'Patient/patient-123' },
};

describe('ConditionModal', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (props: Partial<Parameters<typeof ConditionModal>[0]> = {}): ReturnType<typeof render> => {
    return render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <ConditionModal patient={mockPatient} encounter={mockEncounter} onSubmit={vi.fn()} {...props} />
        </MantineProvider>
      </MedplumProvider>
    );
  };

  test('renders form fields', () => {
    setup();
    expect(screen.getByText('ICD-10 Code')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('renders required field indicators', () => {
    setup();
    const requiredMarkers = screen.getAllByText('*');
    expect(requiredMarkers.length).toBeGreaterThan(0);
  });

  test('renders ICD-10 code input', () => {
    setup();
    expect(screen.getByText('ICD-10 Code')).toBeInTheDocument();
  });

  test('renders status input', () => {
    setup();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  test('renders save button', () => {
    setup();
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeInTheDocument();
  });

  test('form is wrapped in Form component', () => {
    const { container } = setup();
    const form = container.querySelector('form');
    expect(form).toBeInTheDocument();
  });
});
