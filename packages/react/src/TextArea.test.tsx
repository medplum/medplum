import { OperationOutcome } from '@medplum/fhirtypes';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TextArea } from './TextArea';

describe('TextArea', () => {
  test('Renders', () => {
    expect(render(<TextArea name="test" />)).toBeDefined();
  });

  test('Renders default value', () => {
    render(<TextArea name="test" defaultValue="hello" />);
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

    render(<TextArea name="test" defaultValue="hello" outcome={outcome} />);
    const input = screen.getByDisplayValue('hello');
    expect(input).toBeDefined();
    expect(input.getAttribute('aria-invalid')).toEqual('true');
    expect(input.getAttribute('aria-describedby')).toEqual('test-errors');
  });
});
