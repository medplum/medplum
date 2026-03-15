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

  test('Renders with use option', () => {
    render(<AddressDisplay value={{ line: ['123 main st'], city: 'Happy', use: 'home' }} options={{ use: true }} />);
    expect(screen.getByText('123 main st, Happy, [home]')).toBeInTheDocument();
  });

  test('Renders with lineSeparator option', () => {
    render(
      <AddressDisplay
        value={{ line: ['123 main st'], city: 'Happy', state: 'CA' }}
        options={{ lineSeparator: ' | ' }}
      />
    );
    expect(screen.getByText('123 main st | Happy, CA')).toBeInTheDocument();
  });
});
