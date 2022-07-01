import { act, fireEvent, render, screen } from '@testing-library/react';
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

  test('Change without callback', async () => {
    render(<Checkbox name="test" testid="checkbox-test" />);

    await act(() => {
      fireEvent.click(screen.getByTestId('checkbox-test'));
    });

    expect(screen.getByTestId('checkbox-test')).toBeInstanceOf(HTMLInputElement);
    expect((screen.getByTestId('checkbox-test') as HTMLInputElement).checked).toBe(true);
  });

  test('Change with callback', async () => {
    const onChange = jest.fn();

    render(<Checkbox name="test" testid="checkbox-test" onChange={onChange} />);

    await act(() => {
      fireEvent.click(screen.getByTestId('checkbox-test'));
    });

    expect(onChange).toHaveBeenCalledWith(true);
    onChange.mockClear();

    await act(() => {
      fireEvent.click(screen.getByTestId('checkbox-test'));
    });

    expect(onChange).toHaveBeenCalledWith(false);
  });
});
