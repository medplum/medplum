// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen } from '../test-utils/render';
import { PatientInfoItem } from './PatientInfoItem';

describe('PatientInfoItem', () => {
  test('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<PatientInfoItem value="Value A" icon={null} placeholder="Placeholder" label="Label" onClick={onClick} />);

    fireEvent.click(screen.getByText('Value A'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('is not clickable without onClick', () => {
    render(<PatientInfoItem value="Value C" icon={null} placeholder="Placeholder" label="Label" />);

    expect(screen.getByText('Value C').closest('[class*="clickable"]')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('is clickable with onClick', () => {
    render(<PatientInfoItem value="Value D" icon={null} placeholder="Placeholder" label="Label" onClick={vi.fn()} />);

    expect(screen.getByText('Value D').closest('[class*="clickable"]')).not.toBeNull();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  test('shows the placeholder when value is empty', () => {
    render(<PatientInfoItem value={undefined} icon={null} placeholder="Add Birthdate" label="Label" />);

    expect(screen.getByText('Add Birthdate')).toBeInTheDocument();
  });
});
