import { createReference } from '@medplum/core';
import { HomerObservation1, MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { ResourceForm, ResourceFormProps } from './ResourceForm';

const medplum = new MockClient();

describe('ResourceForm', () => {
  function setup(props: ResourceFormProps) {
    return render(
      <MedplumProvider medplum={medplum}>
        <ResourceForm {...props} />
      </MedplumProvider>
    );
  }

  test('Error on missing resource type', async () => {
    const onSubmit = jest.fn();

    setup({
      defaultValue: {},
      onSubmit,
    });
  });

  test('Renders empty Practitioner form', async () => {
    const onSubmit = jest.fn();

    setup({
      defaultValue: {
        resourceType: 'Practitioner',
      },
      onSubmit,
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Resource Type'));
    });

    const control = screen.getByText('Resource Type');
    expect(control).toBeDefined();
  });

  test('Renders Practitioner resource', async () => {
    const onSubmit = jest.fn();

    setup({
      defaultValue: {
        reference: 'Practitioner/123',
      },
      onSubmit,
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Resource Type'));
    });

    const control = screen.getByText('Resource Type');
    expect(control).toBeDefined();
  });

  test('Submit Practitioner', async () => {
    const onSubmit = jest.fn();

    setup({
      defaultValue: {
        resourceType: 'Practitioner',
      },
      onSubmit,
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Resource Type'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toBeCalled();
  });

  test('Renders empty Observation form', async () => {
    const onSubmit = jest.fn();

    setup({
      defaultValue: {
        resourceType: 'Observation',
      },
      onSubmit,
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Resource Type'));
    });

    const control = screen.getByText('Resource Type');
    expect(control).toBeDefined();
  });

  test('Renders Observation resource', async () => {
    const onSubmit = jest.fn();

    setup({
      defaultValue: createReference(HomerObservation1),
      onSubmit,
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Resource Type'));
    });

    const control = screen.getByText('Resource Type');
    expect(control).toBeDefined();
  });

  test('Submit Observation', async () => {
    const onSubmit = jest.fn();

    setup({
      defaultValue: {
        resourceType: 'Observation',
        valueQuantity: {
          value: 1,
          unit: 'kg',
        },
      },
      onSubmit,
    });

    await act(async () => {
      await waitFor(() => screen.getByText('Resource Type'));
    });

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

    await act(async () => {
      setup({
        defaultValue: {
          resourceType: 'Practitioner',
          id: 'xyz',
        },
        onSubmit,
        onDelete,
      });
    });

    expect(screen.getByText('Delete')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    expect(onSubmit).not.toBeCalled();
    expect(onDelete).toBeCalled();
  });
});
