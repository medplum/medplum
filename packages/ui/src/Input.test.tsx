import { OperationOutcome } from '@medplum/fhirtypes';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Input } from './Input';

describe('Input', () => {
  test('Renders', () => {
    expect(render(<Input name="test" />)).toBeDefined();
  });

  test('Renders default value', () => {
    render(<Input name="test" defaultValue="hello" />);
    expect(screen.getByDisplayValue('hello')).toBeDefined();
  });

  test('Renders aria invalid', () => {
    const outcome: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [
        {
          details: {
            text: 'Bad',
          },
          expression: ['test'],
        },
      ],
    };

    render(<Input name="test" defaultValue="hello" outcome={outcome} />);
    const input = screen.getByDisplayValue('hello');
    expect(input).toBeDefined();
    expect(input.getAttribute('aria-invalid')).toEqual('true');
    expect(input.getAttribute('aria-describedby')).toEqual('test-errors');
  });
});
