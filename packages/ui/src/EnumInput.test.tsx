import { ElementDefinition } from '@medplum/core';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { EnumInput } from './EnumInput';

const statusProperty: ElementDefinition = {
  short: 'foo | bar | baz'
};

describe('EnumInput', () => {

  test('Renders', () => {
    render(
      <EnumInput property={statusProperty} name="test" value="" />
    );

    expect(screen.getByTestId('enum-input')).not.toBeUndefined();
    expect(screen.getByText('foo')).not.toBeUndefined();
    expect(screen.getByText('bar')).not.toBeUndefined();
    expect(screen.getByText('baz')).not.toBeUndefined();
  });

});
