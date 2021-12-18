import { OperationOutcome } from '@medplum/fhirtypes';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Select, TextField } from './TextField';

describe('TextField', () => {
  test('Renders', () => {
    expect(render(<TextField name="test" />)).toBeDefined();
  });

  test('Renders default value', () => {
    render(<TextField name="test" defaultValue="hello" />);
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

    render(<TextField name="test" defaultValue="hello" outcome={outcome} />);
    const input = screen.getByDisplayValue('hello');
    expect(input).toBeDefined();
    expect(input.getAttribute('aria-invalid')).toEqual('true');
    expect(input.getAttribute('aria-describedby')).toEqual('test-errors');
  });
});

describe('Select', () => {
  test('Renders', () => {
    expect(
      render(
        <Select name="test">
          <option></option>
        </Select>
      )
    ).toBeDefined();
  });

  test('Renders default value', () => {
    render(
      <Select name="test" defaultValue="b">
        <option value="a">a</option>
        <option value="b">b</option>
        <option value="c">c</option>
      </Select>
    );
    expect(screen.getByDisplayValue('b')).toBeDefined();
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

    render(
      <Select name="test" defaultValue="b" outcome={outcome}>
        <option value="a">a</option>
        <option value="b">b</option>
        <option value="c">c</option>
      </Select>
    );
    const input = screen.getByDisplayValue('b');
    expect(input).toBeDefined();
    expect(input.getAttribute('aria-invalid')).toEqual('true');
    expect(input.getAttribute('aria-describedby')).toEqual('test-errors');
  });
});
