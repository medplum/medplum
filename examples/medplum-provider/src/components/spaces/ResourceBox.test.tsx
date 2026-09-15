// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { ReadablePromise } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ResourceBox } from './ResourceBox';

const patient: Patient = {
  resourceType: 'Patient',
  id: 'patient-abc',
  name: [{ given: ['Marge'], family: 'Simpson' }],
};

describe('ResourceBox', () => {
  let medplum: MockClient;
  const onClick = vi.fn();

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
    await medplum.createResource(patient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setup(resourceReference: string): void {
    render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <ResourceBox resourceReference={resourceReference} onClick={onClick} />
        </MantineProvider>
      </MedplumProvider>
    );
  }

  test('shows loading state while the resource is being fetched', () => {
    vi.spyOn(medplum, 'readReference').mockReturnValue(new ReadablePromise(new Promise<never>(() => {})));

    setup('Patient/patient-abc');

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-box')).not.toBeInTheDocument();
  });

  test('renders the resource type and display name once loaded', async () => {
    setup('Patient/patient-abc');

    const box = await screen.findByTestId('resource-box');
    expect(box).toHaveTextContent('Patient');
    expect(box).toHaveTextContent('Marge Simpson');
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  test('calls onClick with the reference string when clicked', async () => {
    const user = userEvent.setup();
    setup('Patient/patient-abc');

    await user.click(await screen.findByTestId('resource-box'));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith('Patient/patient-abc');
  });

  test('reports an invalid reference without fetching', () => {
    const readSpy = vi.spyOn(medplum, 'readReference');

    setup('Patient');

    expect(screen.getByText('Invalid resource reference')).toBeInTheDocument();
    expect(readSpy).not.toHaveBeenCalled();
  });

  test('shows the error message when the fetch fails with an Error', async () => {
    vi.spyOn(medplum, 'readReference').mockRejectedValue(new Error('Boom'));

    setup('Patient/patient-abc');

    expect(await screen.findByText('Boom')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-box')).not.toBeInTheDocument();
  });

  test('stringifies non-Error rejections', async () => {
    vi.spyOn(medplum, 'readReference').mockRejectedValue('plain failure');

    setup('Patient/patient-abc');

    expect(await screen.findByText('plain failure')).toBeInTheDocument();
  });

  test('shows a not-found message when the resource does not exist', async () => {
    setup('Patient/does-not-exist');

    expect(await screen.findByText('Not found')).toBeInTheDocument();
  });

  test('shows a fallback message when the fetch resolves without a resource', async () => {
    vi.spyOn(medplum, 'readReference').mockResolvedValue(undefined as unknown as WithId<Patient>);

    setup('Patient/patient-abc');

    expect(await screen.findByText('Unable to find resource')).toBeInTheDocument();
  });
});
