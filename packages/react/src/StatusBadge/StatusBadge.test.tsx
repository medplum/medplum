// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '../test-utils/render';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  test('Renders', () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText('active')).toBeDefined();
    expect(screen.getByText('active')).toHaveStyle('background-image:');
  });

  test('Renders formatted status', () => {
    render(<StatusBadge status="in-progress" />);
    expect(screen.getByText('in progress')).toBeDefined();
  });
});
