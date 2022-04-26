import { IndexedStructureDefinition } from '@medplum/core';
import { ElementDefinition } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import { ResourceArrayInput } from './ResourceArrayInput';

const schema: IndexedStructureDefinition = {
  types: {},
};

const property: ElementDefinition = {
  type: [
    {
      code: 'string',
    },
  ],
};

describe('ResourceArrayInput', () => {
  test('Renders default', () => {
    render(<ResourceArrayInput schema={schema} property={property} name="myProp" />);

    expect(screen.getByText('Add')).toBeInTheDocument();
  });

  test('Renders empty', () => {
    render(<ResourceArrayInput schema={schema} property={property} name="myProp" defaultValue={[]} />);

    expect(screen.getByText('Add')).toBeInTheDocument();
  });

  test('Renders elements', () => {
    render(<ResourceArrayInput schema={schema} property={property} name="myProp" defaultValue={['foo', 'bar']} />);

    expect(screen.getByDisplayValue('foo')).toBeInTheDocument();
    expect(screen.getByDisplayValue('bar')).toBeInTheDocument();
    expect(screen.getByText('Add')).toBeInTheDocument();
    expect(screen.getAllByText('Remove')).toHaveLength(2);
  });

  test('Click add button', async () => {
    render(<ResourceArrayInput schema={schema} property={property} name="myProp" defaultValue={[]} />);

    expect(screen.getByText('Add')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Add'));
    });

    expect(screen.getByTestId('myProp.0')).toBeInTheDocument();
  });

  test('Click remove button', async () => {
    render(<ResourceArrayInput schema={schema} property={property} name="myProp" defaultValue={['foo', 'bar']} />);

    await act(async () => {
      fireEvent.click(screen.getAllByText('Remove')[0]);
    });

    expect(screen.queryByDisplayValue('foo')).toBeNull();
    expect(screen.getByDisplayValue('bar')).toBeInTheDocument();
  });

  test('Change value', async () => {
    const onChange = vi.fn();

    render(
      <ResourceArrayInput
        schema={schema}
        property={property}
        name="myProp"
        defaultValue={['foo', 'bar']}
        onChange={onChange}
      />
    );

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('foo'), {
        target: { value: 'baz' },
      });
    });

    expect(onChange).toHaveBeenCalledWith(['baz', 'bar']);
  });
});
