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

  test('shows the placeholder when value is empty', () => {
    render(<PatientInfoItem value={undefined} icon={null} placeholder="Add Birthdate" label="Label" />);

    expect(screen.getByText('Add Birthdate')).toBeInTheDocument();
  });
});
