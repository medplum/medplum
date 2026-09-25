// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen } from '../test-utils/render';
import { MonthPickerButton } from './MonthPickerButton';

describe('MonthPickerButton', () => {
  test('Picks a month', () => {
    const onChange = vi.fn();
    render(<MonthPickerButton label="September 2026" date={new Date(2026, 8, 15)} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mar' }));

    expect(onChange).toHaveBeenCalledWith('2026-03-01');
    expect(screen.queryByRole('button', { name: 'Mar' })).toBeNull();
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

    fireEvent.click(screen.getByRole('button', { name: 'Go to month' }));

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Aug' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sep' }).disabled).toBe(false);
  });
});
