// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen } from '../test-utils/render';
import { MonthPickerButton } from './MonthPickerButton';

describe('MonthPickerButton', () => {
  test('Picks a month', () => {
    const onChange = vi.fn();
    render(<MonthPickerButton label="September 2026" date={new Date(2026, 8, 15)} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'September 2026' }));
    expect(screen.getByRole('button', { name: 'Sep' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Mar' }));

    expect(onChange).toHaveBeenCalledWith(new Date(2026, 2, 1));
    expect(screen.queryByRole('button', { name: 'Mar' })).toBeNull();
  });

  test('Picks a month in another year', () => {
    const onChange = vi.fn();
    render(<MonthPickerButton label="September 2026" date={new Date(2026, 8, 15)} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'September 2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next year' }));
    expect(screen.getByRole('button', { name: 'Sep' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Feb' }));

    expect(onChange).toHaveBeenCalledWith(new Date(2027, 1, 1));
  });

  test('Months before the minimum are disabled', () => {
    render(
      <MonthPickerButton
        label="September 2026"
        date={new Date(2026, 8, 15)}
        minDate={new Date(2026, 8, 10)}
        onChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'September 2026' }));

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Previous year' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Aug' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sep' }).disabled).toBe(false);
  });
});
