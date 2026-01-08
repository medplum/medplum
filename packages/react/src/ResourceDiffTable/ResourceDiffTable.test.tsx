// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedicationRequest, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, screen } from '../test-utils/render';
import type { ResourceDiffTableProps } from './ResourceDiffTable';
import { ResourceDiffTable } from './ResourceDiffTable';

const medplum = new MockClient();

describe('ResourceDiffTable', () => {
  function setup(props: ResourceDiffTableProps): void {
    render(
      <MedplumProvider medplum={medplum}>
        <ResourceDiffTable {...props} />
      </MedplumProvider>
    );
  }

  test('Renders', async () => {
    const original: Patient = {
      resourceType: 'Patient',
      id: '123',
      meta: {
        author: { reference: 'Practitioner/456' },
        versionId: '456',
      },
      birthDate: '1990-01-01',
      active: false,
    };

    const revised: Patient = {
      resourceType: 'Patient',
      id: '123',
      meta: {
        author: { reference: 'Practitioner/457' },
        versionId: '457',
      },
      birthDate: '1990-01-01',
      active: true,
    };

    await act(async () => {
      setup({ original, revised });
    });

    expect(await screen.findByText('Replace active')).toBeInTheDocument();

    const removed = screen.getByText('false');
    expect(removed).toBeDefined();
    expect(removed).toHaveClass('removed');

    const added = screen.getByText('true');
    expect(added).toBeDefined();
    expect(added).toHaveClass('added');

    // ID and meta should not be shown
    expect(screen.queryByText('ID')).toBeNull();
    expect(screen.queryByText('Meta')).toBeNull();

    // Birth date did not change, and therefore should not be shown
    expect(screen.queryByText('Birth Date')).toBeNull();

    // Certain meta fields should not be shown
    expect(screen.queryByText('Author')).toBeNull();
    expect(screen.queryByText('Version ID')).toBeNull();
  });

  test('Array index operations', async () => {
    const original: Patient = {
      resourceType: 'Patient',
      id: '123',
      meta: { versionId: '456' },
      name: [{ family: 'Smith', given: ['John'] }],
      identifier: [
        { system: 'http://example.com/foo', value: '123' },
        { system: 'http://example.com/bar', value: '456' },
      ],
    };

    const revised: Patient = {
      ...original,
      meta: { versionId: '457' },
      identifier: [
        { system: 'http://example.com/foo', value: '123x' },
        { system: 'http://example.com/bar', value: '456x' },
      ],
    };

    await act(async () => {
      setup({ original, revised });
    });

    expect(await screen.findByText('Replace identifier[0].value')).toBeInTheDocument();
    expect(screen.getByText('Replace identifier[0].value')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
    expect(screen.getByText('123x')).toBeInTheDocument();
    expect(screen.getByText('Replace identifier[1].value')).toBeInTheDocument();
    expect(screen.getByText('456')).toBeInTheDocument();
    expect(screen.getByText('456x')).toBeInTheDocument();
  });

  test('Single array add', async () => {
    const original: Patient = {
      resourceType: 'Patient',
      id: '123',
      meta: { versionId: '456' },
      name: [{ family: 'Smith', given: ['John'] }],
      identifier: [{ system: 'http://example.com/foo', value: '123' }],
    };

    const revised: Patient = {
      ...original,
      meta: { versionId: '457' },
      identifier: [
        { system: 'http://example.com/foo', value: '123' },
        { system: 'http://example.com/bar', value: '456' },
      ],
    };

    await act(async () => {
      setup({ original, revised });
    });

    expect(await screen.findByText('Add identifier.last()')).toBeInTheDocument();

    const operations = screen.getAllByText('Add identifier.last()');
    expect(operations).toHaveLength(1);
  });

  test('Combine patch operations on array add', async () => {
    const original: Patient = {
      resourceType: 'Patient',
      id: '123',
      meta: { versionId: '456' },
      name: [{ family: 'Smith', given: ['John'] }],
      identifier: [{ system: 'http://example.com/foo', value: '123' }],
    };

    const revised: Patient = {
      ...original,
      meta: { versionId: '457' },
      identifier: [
        { system: 'http://example.com/foo', value: '123' },
        { system: 'http://example.com/bar', value: '456' },
        { system: 'http://example.com/baz', value: '789' },
      ],
    };

    await act(async () => {
      setup({ original, revised });
    });

    expect(await screen.findByText('Replace identifier')).toBeInTheDocument();

    const operations = screen.getAllByText('Replace identifier');
    expect(operations).toHaveLength(1);
  });

  test('Single array remove', async () => {
    const original: Patient = {
      resourceType: 'Patient',
      id: '123',
      meta: { versionId: '456' },
      name: [{ family: 'Smith', given: ['John'] }],
      identifier: [
        { system: 'http://example.com/foo', value: '123' },
        { system: 'http://example.com/bar', value: '456' },
      ],
    };

    const revised: Patient = {
      ...original,
      meta: { versionId: '457' },
      identifier: [{ system: 'http://example.com/foo', value: '123' }],
    };

    await act(async () => {
      setup({ original, revised });
    });

    expect(await screen.findByText('Remove identifier[1]')).toBeInTheDocument();

    const operations = screen.getAllByText('Remove identifier[1]');
    expect(operations).toHaveLength(1);
  });

  test('Combine patch operations on array remove', async () => {
    const original: Patient = {
      resourceType: 'Patient',
      id: '123',
      meta: { versionId: '456' },
      name: [{ family: 'Smith', given: ['John'] }],
      identifier: [
        { system: 'http://example.com/foo', value: '123' },
        { system: 'http://example.com/bar', value: '456' },
        { system: 'http://example.com/baz', value: '789' },
      ],
    };

    const revised: Patient = {
      ...original,
      meta: { versionId: '457' },
      identifier: [{ system: 'http://example.com/foo', value: '123' }],
    };

    await act(async () => {
      setup({ original, revised });
    });

    expect(await screen.findByText('Replace identifier')).toBeInTheDocument();

    const operations = screen.getAllByText('Replace identifier');
    expect(operations).toHaveLength(1);
  });

  test('Change attachment URL', async () => {
    const original: Patient = {
      resourceType: 'Patient',
      id: '123',
      meta: { versionId: '456' },
      name: [{ family: 'Smith', given: ['John'] }],
      photo: [{ url: 'http://example.com/foo.jpg' }],
    };

    const revised: Patient = {
      ...original,
      meta: { versionId: '457' },
      photo: [{ url: 'http://example.com/bar.jpg' }],
    };

    await act(async () => {
      setup({ original, revised });
    });

    expect(await screen.findByText('Replace photo[0]')).toBeInTheDocument();

    await act(async () => {
      const button = screen.getByText('Expand');
      button.click();
    });

    // There should be 2 download links
    expect(screen.getAllByText('Download')).toHaveLength(2);
  });

  test('Handles changes in contained resources', async () => {
    console.warn = jest.fn();

    const original: MedicationRequest = {
      resourceType: 'MedicationRequest',
      id: '123',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/456' },
      contained: [
        {
          resourceType: 'Medication',
          id: 'med1',
          code: { text: 'Before' },
        },
      ],
    };

    const revised: MedicationRequest = {
      resourceType: 'MedicationRequest',
      id: '123',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/456' },
      contained: [
        {
          resourceType: 'Medication',
          id: 'med1',
          code: { text: 'After' },
        },
      ],
    };

    await act(async () => {
      setup({ original, revised });
    });

    expect(await screen.findByText('Replace contained[0].code.text')).toBeInTheDocument();
    expect(console.warn).toHaveBeenCalledWith('Failed to get element definition', expect.anything());
  });
});
