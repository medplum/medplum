import { InternalSchemaElement } from '@medplum/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ResourceArrayInput } from './ResourceArrayInput';

const property: InternalSchemaElement = {
  path: 'test',
  description: 'Test',
  min: 0,
  max: 1,
  type: [
    {
      code: 'string',
    },
  ],
};

describe('ResourceArrayInput', () => {
  test('Renders default', () => {
    render(<ResourceArrayInput property={property} name="myProp" />);

    expect(screen.getByTitle('Add')).toBeInTheDocument();
  });

  test('Renders empty', () => {
    render(<ResourceArrayInput property={property} name="myProp" defaultValue={[]} />);

    expect(screen.getByTitle('Add')).toBeInTheDocument();
  });

  test('Renders elements', () => {
    render(<ResourceArrayInput property={property} name="myProp" defaultValue={['foo', 'bar']} />);

    expect(screen.getByDisplayValue('foo')).toBeInTheDocument();
    expect(screen.getByDisplayValue('bar')).toBeInTheDocument();
    expect(screen.getByTitle('Add')).toBeInTheDocument();
    expect(screen.getAllByTitle('Remove')).toHaveLength(2);
  });

  test('Handles non-arrays', () => {
    render(<ResourceArrayInput property={property} name="myProp" defaultValue={'x' as unknown as string[]} />);

    expect(screen.getByTitle('Add')).toBeInTheDocument();
  });

  test('Click add button', async () => {
    render(<ResourceArrayInput property={property} name="myProp" defaultValue={[]} />);

    expect(screen.getByTitle('Add')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTitle('Add'));
    });

    expect(screen.getByTestId('myProp.0')).toBeInTheDocument();
  });

  test('Click remove button', async () => {
    render(<ResourceArrayInput property={property} name="myProp" defaultValue={['foo', 'bar']} />);

    await act(async () => {
      fireEvent.click(screen.getAllByTitle('Remove')[0]);
    });

    expect(screen.queryByDisplayValue('foo')).toBeNull();
    expect(screen.getByDisplayValue('bar')).toBeInTheDocument();
  });

  test('Change value', async () => {
    const onChange = jest.fn();

    render(<ResourceArrayInput property={property} name="myProp" defaultValue={['foo', 'bar']} onChange={onChange} />);

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('foo'), {
        target: { value: 'baz' },
      });
    });

    expect(onChange).toHaveBeenCalledWith(['baz', 'bar']);
  });
});
