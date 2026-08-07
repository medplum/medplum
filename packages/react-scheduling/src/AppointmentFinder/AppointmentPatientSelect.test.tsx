// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { clickAutocompleteOption, typeInAutocomplete } from '../test-utils/asyncAutocomplete';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { AppointmentPatientSelect } from './AppointmentPatientSelect';

const medplum = new MockClient();

const MR_TYPE = { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR' }] };

const HOMER: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'homer',
  name: [{ given: ['Homer'], family: 'Bookworm' }],
  birthDate: '1956-05-12',
  identifier: [
    // Something nobody should be reading out, listed first.
    { system: 'http://hl7.org/fhir/sid/us-ssn', value: '111-22-3333' },
    { type: MR_TYPE, system: 'http://example.com/mrn', value: 'MRN-0042' },
  ],
};

const MARGE: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'marge',
  name: [{ given: ['Marge'], family: 'Bookworm' }],
};

// Older than Homer, and enrolled under a plain system rather than a typed MRN.
const ABE: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'abe',
  name: [{ given: ['Abe'], family: 'Bookworm' }],
  birthDate: '1927-04-01',
  identifier: [{ system: 'http://example.com/mrn', value: 'MRN-0001' }],
};

function setup(
  onChange: (patient: WithId<Patient> | undefined) => void,
  patient?: WithId<Patient>,
  mrnSystem?: string
): void {
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );
  render(<AppointmentPatientSelect patient={patient} onChange={onChange} mrnSystem={mrnSystem} />, wrapper);
}

describe('AppointmentPatientSelect', () => {
  beforeAll(async () => {
    await medplum.createResource(HOMER);
    await medplum.createResource(MARGE);
    await medplum.createResource(ABE);
  });

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  test('Searches by name and reports the patient that was picked', async () => {
    const onChange = vi.fn();
    setup(onChange);

    await typeInAutocomplete(screen.getByPlaceholderText('Search by name'), 'Bookworm');
    await clickAutocompleteOption('Homer Bookworm');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'homer' }));
  });

  test('Identifies each match by birth date and MRN, which is how two people with one name are told apart', async () => {
    setup(vi.fn());

    await typeInAutocomplete(screen.getByPlaceholderText('Search by name'), 'Bookworm');

    expect(await screen.findByText('Homer Bookworm')).toBeInTheDocument();
    expect(screen.getByText('Born 5/12/1956 · MRN MRN-0042')).toBeInTheDocument();
    // The MRN is the identifier that says it is one. The SSN sitting ahead of it
    // is not something to put on screen.
    expect(screen.queryByText(/111-22-3333/)).not.toBeInTheDocument();
    // Marge has neither on file, so there is nothing to tell her apart by.
    expect(screen.getByText('Marge Bookworm')).toBeInTheDocument();
    expect(screen.getAllByText(/Born/)).toHaveLength(2);
  });

  test('Lists a patient with only one of the two by that one alone', async () => {
    setup(vi.fn());

    await typeInAutocomplete(screen.getByPlaceholderText('Search by name'), 'Bookworm');

    // Abe's identifier is untyped, so without a system to look under there is no
    // MRN to show and the birth date stands on its own.
    expect(await screen.findByText('Born 4/1/1927')).toBeInTheDocument();
  });

  test('Reads MRNs from a named system, for a project that does not type them', async () => {
    setup(vi.fn(), undefined, 'http://example.com/mrn');

    await typeInAutocomplete(screen.getByPlaceholderText('Search by name'), 'Bookworm');

    expect(await screen.findByText('Born 4/1/1927 · MRN MRN-0001')).toBeInTheDocument();
  });

  test('Leads with the oldest match', async () => {
    setup(vi.fn());

    await typeInAutocomplete(screen.getByPlaceholderText('Search by name'), 'Bookworm');
    await screen.findByText('Abe Bookworm');

    // Names collide most among the elderly, so the oldest match is the one most
    // worth putting first.
    const listed = screen.getAllByText(/Bookworm$/).map((element) => element.textContent);
    expect(listed).toStrictEqual(['Abe Bookworm', 'Homer Bookworm', 'Marge Bookworm']);
  });

  // The field it is given is resolved before the input renders, so the patient
  // carried in appears a tick after mount rather than on the first paint.
  test('Starts on the patient it was given', async () => {
    setup(vi.fn(), HOMER);
    expect(await screen.findByText('Homer Bookworm')).toBeInTheDocument();
  });

  test('Reports nothing chosen when the patient is cleared', async () => {
    const onChange = vi.fn();
    setup(onChange, HOMER);

    fireEvent.click(await screen.findByTitle('Clear all'));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
