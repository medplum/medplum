import { render, screen } from '@testing-library/react';
import React from 'react';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  test('Renders', () => {
    expect(render(<Checkbox name="test" />)).toBeDefined();
  });

  test('Renders default value', () => {
    render(<Checkbox name="test" testid="checkbox-test" defaultValue={true} />);
    expect(screen.getByTestId('checkbox-test')).toBeInstanceOf(HTMLInputElement);
    expect((screen.getByTestId('checkbox-test') as HTMLInputElement).checked).toBe(true);
  });
});
