import { createReference } from '@medplum/core';
import { Patient, Specimen } from '@medplum/fhirtypes';
import { HomerObservation1, MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { convertIsoToLocal, convertLocalToIso } from '../DateTimeInput/DateTimeInput.utils';
import { MedplumProvider } from '@medplum/react-hooks';
import { ResourceForm, ResourceFormProps } from './ResourceForm';

const medplum = new MockClient();

describe('ResourceForm', () => {
  async function setup(props: ResourceFormProps): Promise<void> {
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <ResourceForm {...props} />
        </MedplumProvider>
      );
    });
  }

  test('Error on missing resource type', async () => {
    const onSubmit = jest.fn();

    await setup({
      defaultValue: {},
      onSubmit,
    });
  });

  test('Renders empty Practitioner form', async () => {
    const onSubmit = jest.fn();

    await setup({
      defaultValue: {
        resourceType: 'Practitioner',
      },
      onSubmit,
    });

    await waitFor(() => screen.getByText('Resource Type'));

    const control = screen.getByText('Resource Type');
    expect(control).toBeDefined();
  });

  test('Renders Practitioner resource', async () => {
    const onSubmit = jest.fn();

    await setup({
      defaultValue: {
        reference: 'Practitioner/123',
      },
      onSubmit,
    });

    await waitFor(() => screen.getByText('Resource Type'));

    const control = screen.getByText('Resource Type');
    expect(control).toBeDefined();
  });

  test('Submit Practitioner', async () => {
    const onSubmit = jest.fn();

    await setup({
      defaultValue: {
        resourceType: 'Practitioner',
      },
      onSubmit,
    });

    await waitFor(() => screen.getByText('Resource Type'));

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toBeCalled();
  });

  test('Renders empty Observation form', async () => {
    const onSubmit = jest.fn();

    await setup({
      defaultValue: {
        resourceType: 'Observation',
      },
      onSubmit,
    });

    await waitFor(() => screen.getByText('Resource Type'));

    const control = screen.getByText('Resource Type');
    expect(control).toBeDefined();
  });

  test('Renders Observation resource', async () => {
    const onSubmit = jest.fn();

    await setup({
      defaultValue: createReference(HomerObservation1),
      onSubmit,
    });

    await waitFor(() => screen.getByText('Resource Type'));

    const control = screen.getByText('Resource Type');
    expect(control).toBeDefined();
  });

  test('Submit Observation', async () => {
    await medplum.requestSchema('Observation');

    const onSubmit = jest.fn();

    await setup({
      defaultValue: {
        resourceType: 'Observation',
        valueQuantity: {
          value: 1,
          unit: 'kg',
        },
      },
      onSubmit,
    });

    await waitFor(() => screen.getByText('Resource Type'));

    // Change the value[x] from Quantity to string
    // and set a value
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Quantity'), {
        target: { value: 'string' },
      });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('value[x]'), {
        target: { value: 'hello' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toBeCalled();

    const result = onSubmit.mock.calls[0][0];
    expect(result.resourceType).toBe('Observation');
    expect(result.valueQuantity).toBeUndefined();
    expect(result.valueString).toBe('hello');
  });

  test('Delete', async () => {
    const onSubmit = jest.fn();
    const onDelete = jest.fn();

    await setup({
      defaultValue: {
        resourceType: 'Practitioner',
        id: 'xyz',
      },
      onSubmit,
      onDelete,
    });

    expect(screen.getByText('Delete')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    expect(onSubmit).not.toBeCalled();
    expect(onDelete).toBeCalled();
  });

  test('Change Specimen.collection.collectedDateTime', async () => {
    const date = new Date();
    date.setMilliseconds(0); // datetime-local does not support milliseconds
    const localString = convertIsoToLocal(date.toISOString());
    const isoString = convertLocalToIso(localString);
    const onSubmit = jest.fn();

    await setup({ defaultValue: { resourceType: 'Specimen' }, onSubmit });

    await waitFor(() => screen.getByText('Resource Type'));

    await act(async () => {
      fireEvent.change(screen.getByTestId('collected[x]'), { target: { value: localString } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toBeCalled();

    const result = onSubmit.mock.calls[0][0] as Specimen;
    expect(result.resourceType).toBe('Specimen');
    expect(result.collection).toBeDefined();
    expect(result.collection?.collectedDateTime).toBe(isoString);
  });

  test('Change boolean', async () => {
    const onSubmit = jest.fn();

    await setup({ defaultValue: { resourceType: 'Patient' }, onSubmit });

    await waitFor(() => screen.getByText('Resource Type'));

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Active'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toBeCalled();

    const patient = onSubmit.mock.calls[0][0] as Patient;
    expect(patient.resourceType).toBe('Patient');
    expect(patient.active).toBe(true);
  });
});
