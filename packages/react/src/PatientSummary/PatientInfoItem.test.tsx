// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { HomerSimpson } from '@medplum/mock';
import { fireEvent, render, screen } from '../test-utils/render';
import { PatientInfoItem } from './PatientInfoItem';

describe('PatientInfoItem', () => {
  test('calls onClick when provided, taking precedence over onClickResource', () => {
    const onClick = vi.fn();
    const onClickResource = vi.fn();
    render(
      <PatientInfoItem
        patient={HomerSimpson}
        value="Value A"
        icon={null}
        placeholder="Placeholder"
        label="Label"
        onClick={onClick}
        onClickResource={onClickResource}
      />
    );

    fireEvent.click(screen.getByText('Value A'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClickResource).not.toHaveBeenCalled();
  });

  test('falls back to onClickResource when onClick is not provided', () => {
    const onClickResource = vi.fn();
    render(
      <PatientInfoItem
        patient={HomerSimpson}
        value="Value B"
        icon={null}
        placeholder="Placeholder"
        label="Label"
        onClickResource={onClickResource}
      />
    );

    fireEvent.click(screen.getByText('Value B'));
    expect(onClickResource).toHaveBeenCalledWith(HomerSimpson);
  });

  test('shows the placeholder when value is empty', () => {
    render(
      <PatientInfoItem
        patient={HomerSimpson}
        value={undefined}
        icon={null}
        placeholder="Add Birthdate"
        label="Label"
      />
    );

    expect(screen.getByText('Add Birthdate')).toBeInTheDocument();
  });
});
