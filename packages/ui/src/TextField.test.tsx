import { OperationOutcome } from '@medplum/core';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Select, TextField } from '.';

describe('TextField', () => {

  test('Renders', () => {
    expect(render(<TextField name="test" />)).not.toBeUndefined();
  });

  test('Renders default value', () => {
    render(<TextField name="test" defaultValue="hello" />);
    expect(screen.getByDisplayValue('hello')).not.toBeUndefined();
  });

  test('Renders aria invalid', () => {
    const outcome: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [{
        details: {
          text: 'Bad'
        },
        expression: ['test']
      }]
    };

    render(<TextField name="test" defaultValue="hello" outcome={outcome} />);
    const input = screen.getByDisplayValue('hello');
    expect(input).not.toBeUndefined();
    expect(input.getAttribute('aria-invalid')).toEqual('true');
    expect(input.getAttribute('aria-describedby')).toEqual('test-errors');
  });

});

describe('Select', () => {

  test('Renders', () => {
    expect(render(<Select name="test"><option></option></Select>)).not.toBeUndefined();
  });

  test('Renders default value', () => {
    render(
      <Select name="test" defaultValue="b">
        <option value="a">a</option>
        <option value="b">b</option>
        <option value="c">c</option>
      </Select>
    );
    expect(screen.getByDisplayValue('b')).not.toBeUndefined();
  });

  test('Renders aria invalid', () => {
    const outcome: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [{
        details: {
          text: 'Bad'
        },
        expression: ['test']
      }]
    };

    render(
      <Select name="test" defaultValue="b" outcome={outcome}>
        <option value="a">a</option>
        <option value="b">b</option>
        <option value="c">c</option>
      </Select>
    );
    const input = screen.getByDisplayValue('b');
    expect(input).not.toBeUndefined();
    expect(input.getAttribute('aria-invalid')).toEqual('true');
    expect(input.getAttribute('aria-describedby')).toEqual('test-errors');
  });

});
