// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '../test-utils/render';
import { AddressDisplay } from './AddressDisplay';

describe('AddressDisplay', () => {
  test('Renders', () => {
    render(<AddressDisplay value={{ line: ['123 main st'], city: 'Happy' }} />);
    expect(screen.getByText('123 main st, Happy')).toBeInTheDocument();
  });

  test('Renders undefined value', () => {
    render(<AddressDisplay />);
  });
});
